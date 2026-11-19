export const runtime = 'edge';

import Link from "next/link";
import { CalendarRange, AlertTriangle, LogIn, LogOut, Wallet, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ResumenConfigurable } from "./resumen-configurable";
import { HABITACIONES_VALIDAS } from "@/lib/constants";
import { HousekeepingBlock } from "@/components/housekeeping-block";
import { AlertasInlineBlock } from "@/components/alertas-inline-block";
import { SyncStatusBanner } from "@/components/sync-status-banner";
import { TesoreriaBlock } from "@/components/tesoreria-block";
import { hoyMadrid, sumarDias, unAnoAntes } from "@/lib/fechas";
import { requiereAccionCobro } from "@/lib/cobros";

export const metadata = { title: "Resumen" };


export default async function DashboardPage() {
  const supabase = await createClient();
  const todayStr = hoyMadrid();
  const tomorrow = sumarDias(todayStr, 1);
  const in14Days = sumarDias(todayStr, 14);
  const in30Days = sumarDias(todayStr, 30);
  const startMonth = `${todayStr.slice(0, 8)}01`;
  const HABS = HABITACIONES_VALIDAS as unknown as string[];

  // ============= CÁLCULO DE TODOS LOS KPIs DISPONIBLES (server-side) =============

  // A) Check-ins hoy
  const { data: checkinsHoy, count: cntCheckinsHoy } = await supabase
    .from("reservas")
    .select("id, habitacion, huespedes(nombre, apellidos)", { count: "exact" })
    .gte("fecha_in", todayStr)
    .lt("fecha_in", tomorrow)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABITACIONES_VALIDAS as unknown as string[]);

  // B) Check-outs hoy
  const { data: checkoutsHoy, count: cntCheckoutsHoy } = await supabase
    .from("reservas")
    .select("id, habitacion, huespedes(nombre, apellidos)", { count: "exact" })
    .gte("fecha_out", todayStr)
    .lt("fecha_out", tomorrow)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABITACIONES_VALIDAS as unknown as string[]);

  // C) Personas alojadas ahora (cuenta reservas activas y suma personas — fallback nº reservas si no hay dato)
  const { data: presentesData, count: cntReservasActivas } = await supabase
    .from("reservas")
    .select("id, num_huespedes", { count: "exact" })
    .lte("fecha_in", todayStr)
    .gt("fecha_out", todayStr)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABITACIONES_VALIDAS as unknown as string[]);
  const cntPresentes = (presentesData ?? []).reduce((sum: number, r: any) => {
    const n = Number(r?.num_huespedes);
    return sum + (isNaN(n) || n <= 0 ? 2 : n);
  }, 0);
  const reservasActivasCount = cntReservasActivas ?? 0;

  // D) Llegadas mañana
  const dayAfterTomorrow = sumarDias(todayStr, 2);
  const { data: llegadasManana, count: cntLlegadasManana } = await supabase
    .from("reservas")
    .select("id, habitacion, huespedes(nombre, apellidos)", { count: "exact" })
    .gte("fecha_in", tomorrow)
    .lt("fecha_in", dayAfterTomorrow)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABS);

  // E2) Cobros pendientes <14d — solo los que necesitan ACCIÓN nuestra
  //     (excluye Booking Payments / OTA — esos los gestiona el portal)
  const { data: cobros14dRaw } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, importe_total, importe_moneda, canal, forma_pago, anticipo, huespedes(nombre, apellidos)", { count: "exact" })
    .eq("estado_cobro", "pendiente")
    .in("estado_reserva", ["confirmada", "pendiente"])
    .gte("fecha_in", todayStr)
    .lte("fecha_in", in14Days)
    .in("habitacion", HABITACIONES_VALIDAS as unknown as string[])
    .order("fecha_in", { ascending: true });
  const cobros14d = (cobros14dRaw ?? []).filter(requiereAccionCobro);

  // L) Pipeline próximos 30d
  const { data: pipeline30d, count: cntPipeline30d } = await supabase
    .from("reservas")
    .select("id, importe_total", { count: "exact" })
    .gte("fecha_in", todayStr)
    .lte("fecha_in", in30Days)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABS);
  const pipelineRevenue = (pipeline30d ?? []).reduce((s: number, r: any) => s + Number(r.importe_total ?? 0), 0);

  // F) Habitaciones libres hoy
  const { count: cntOcupadasHoy } = await supabase
    .from("reservas")
    .select("id", { count: "exact", head: true })
    .lte("fecha_in", todayStr)
    .gt("fecha_out", todayStr)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABS);
  const libresHoy = Math.max(0, 6 - (cntOcupadasHoy ?? 0));

  // G) Próxima llegada
  const { data: proxLlegada } = await supabase
    .from("reservas")
    .select("habitacion, fecha_in, huespedes(nombre, apellidos)")
    .gt("fecha_in", todayStr)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABS)
    .order("fecha_in", { ascending: true })
    .limit(1)
    .single();

  // H) Tareas pendientes hoy
  let cntTareasHoy = 0;
  try {
    const { count } = await supabase
      .from("tareas")
      .select("id", { count: "exact", head: true })
      .eq("estado", "pendiente");
    cntTareasHoy = count ?? 0;
  } catch {}

  // I) Ingresos del mes (suma metricas_dia del mes actual)
  const { data: metricasMes } = await supabase
    .from("metricas_dia")
    .select("ingresos_dia")
    .gte("fecha", startMonth)
    .lte("fecha", todayStr);
  const ingresosMes = (metricasMes ?? []).reduce((s, m) => s + Number(m.ingresos_dia ?? 0), 0);

  // J) Ingresos del mes frente a las mismas fechas del año anterior
  //    (antes esta tarjeta calculaba el % sobre el objetivo mensual aunque su
  //     título y su ayuda hablaban del año anterior)
  const { data: metricasMesAA } = await supabase
    .from("metricas_dia")
    .select("ingresos_dia")
    .gte("fecha", unAnoAntes(startMonth))
    .lte("fecha", unAnoAntes(todayStr));
  const ingresosMesAA = (metricasMesAA ?? []).reduce((s, m) => s + Number(m.ingresos_dia ?? 0), 0);
  const ingresosVsAA = ingresosMesAA > 0 ? (ingresosMes / ingresosMesAA - 1) * 100 : null;

  // M) Ritmo 7d: reservas HECHAS en los últimos 7 días (fecha de reserva de
  //    MisterPlan, como Métricas) con entrada futura. Una reserva cuenta una vez.
  const { data: pace7dRows } = await supabase
    .from("reservas")
    .select("id_externo_misterplan")
    .gte("fecha_reserva", sumarDias(todayStr, -7))
    .gt("fecha_in", todayStr)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABS);
  const cntPace7d = new Set((pace7dRows ?? []).map((r: any) => r.id_externo_misterplan)).size;

  // N) Pendiente de cobro total: las mismas reservas que piden acción en la
  //    lista de 14 días, sin límite de fecha de entrada (salida desde hoy).
  const { data: cobrosTotal } = await supabase
    .from("reservas")
    .select("importe_total, forma_pago, canal, anticipo")
    .eq("estado_cobro", "pendiente")
    .in("estado_reserva", ["confirmada", "pendiente"])
    .gte("fecha_out", todayStr)
    .in("habitacion", HABS);
  const cobrosTotalImporte = (cobrosTotal ?? []).filter(requiereAccionCobro)
    .reduce((s: number, r: any) => s + Number(r.importe_total ?? 0), 0);

  // V) Reservas nuevas hoy: fecha de reserva de MisterPlan = hoy. Una reserva cuenta una vez.
  const { data: nuevasHoyRows } = await supabase
    .from("reservas")
    .select("id_externo_misterplan")
    .gte("fecha_reserva", todayStr)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABS);
  const cntReservasHoy = new Set((nuevasHoyRows ?? []).map((r: any) => r.id_externo_misterplan)).size;

  // KPIs adicionales (huéspedes etc) — calculo bajo demanda en cliente
  // Por ahora paso solo los más útiles

  // Cobrado este mes + Tasa de cobro
  //  Mide reservas con CHECK-IN en este mes, su estado de cobro y total.
  //  Excluye canceladas y Alojamiento completo.
  const { data: reservasMes } = await supabase
    .from("reservas")
    .select("estado_cobro, importe_total, forma_pago")
    .gte("fecha_in", startMonth)
    .lte("fecha_in", todayStr)
    .neq("estado_reserva", "cancelada")
    .in("habitacion", HABITACIONES_VALIDAS as unknown as string[]);
  const cobradoMes = (reservasMes ?? []).filter((r: any) => r.estado_cobro === "cobrado").reduce((s: number, r: any) => s + Number(r.importe_total ?? 0), 0);
  // Lo que suman esas mismas reservas: la base con la que se compara lo cobrado
  // (feedback Juan 10.08: contra «Ingresos del mes», que va por noches, no cuadraba nunca).
  const facturadoEntradasMes = (reservasMes ?? []).reduce((s: number, r: any) => s + Number(r.importe_total ?? 0), 0);
  const totalReservasMes = (reservasMes ?? []).length;
  // Para la tasa de cobro: las pagadas por Booking Payments cuentan como cobradas
  //  (ya están pagadas a Booking, MrPlan a veces marca pendiente igualmente)
  const cobradasMes = (reservasMes ?? []).filter((r: any) => {
    if (r.estado_cobro === "cobrado") return true;
    const fp = (r.forma_pago ?? "").toString().toLowerCase();
    return /booking[\s_-]*payments|virtual[\s_-]*card|virtualcard/i.test(fp);
  }).length;
  const tasaCobro = totalReservasMes > 0 ? (cobradasMes / totalReservasMes) * 100 : null;

  const kpisData = {
    // Operacionales
    checkins_hoy: { value: cntCheckinsHoy ?? 0, detail: (checkinsHoy ?? []).map((r: any) => `${r.huespedes?.nombre ?? '—'} · ${r.habitacion}`) },
    checkouts_hoy: { value: cntCheckoutsHoy ?? 0, detail: (checkoutsHoy ?? []).map((r: any) => `${r.huespedes?.nombre ?? '—'} · ${r.habitacion}`) },
    huespedes_presentes: { value: cntPresentes ?? 0, hint: reservasActivasCount > 0 ? `${reservasActivasCount} ${reservasActivasCount === 1 ? "habitación ocupada" : "habitaciones ocupadas"}` : "Sin huéspedes" },
    llegadas_manana: { value: cntLlegadasManana ?? 0, detail: (llegadasManana ?? []).map((r: any) => `${r.huespedes?.nombre ?? '—'} · ${r.habitacion}`) },
    cobros_14d: {
      value: cobros14d.length,
      importe: cobros14d.reduce((s: number, r: any) => s + Number(r.importe_total ?? 0), 0),
    },
    habitaciones_libres: { value: cntOcupadasHoy ?? 0, total: 6, hint: `${libresHoy} ${libresHoy === 1 ? "libre" : "libres"}` },
    proxima_llegada: { value: proxLlegada ? `${formatDate(proxLlegada.fecha_in)}` : '—', detail: proxLlegada ? `${(proxLlegada.huespedes as any)?.nombre ?? '—'} · ${proxLlegada.habitacion}` : '' },
    tareas_pendientes: { value: cntTareasHoy },
    // Financieros
    ingresos_mes: { value: ingresosMes },
    ingresos_vs_target: { value: ingresosVsAA, anterior: ingresosMesAA },
    pipeline_30d: { value: cntPipeline30d ?? 0, importe: pipelineRevenue },
    pace_7d: { value: cntPace7d ?? 0 },
    cobros_pendientes_total: { value: cobrosTotalImporte },
    // Operación
    reservas_nuevas_hoy: { value: cntReservasHoy ?? 0 },
    cobrado_mes: { value: cobradoMes, base: facturadoEntradasMes },
    tasa_cobro: { value: tasaCobro, cobradas: cobradasMes, total: totalReservasMes }
  };

  // Housekeeping (bloque 3 revisión Juan) — habitaciones ocupadas con sus contadores de cambio
  let hkRows: any[] = [];
  let hkConfig = { cadencia_sabanas: 4, cadencia_toallas: 2 };
  let hkReservaMap: Record<string, string> = {};
  try {
    const { data: hkData } = await supabase.rpc("calcular_housekeeping_pendiente");
    hkRows = (hkData ?? []).map((r: any) => ({
      habitacion: r.habitacion,
      huesped: r.huesped,
      fecha_in: r.fecha_in,
      noches_consecutivas: r.noches_consecutivas ?? 0,
      noches_desde_ultimo_cambio_sabanas: r.noches_desde_ultimo_cambio_sabanas ?? r.noches_consecutivas ?? 0,
      noches_desde_ultimo_cambio_toallas: r.noches_desde_ultimo_cambio_toallas ?? r.noches_consecutivas ?? 0
    }));
    // Buscar reserva_id por habitación para vincular el cambio
    const { data: reservasActivas } = await supabase
      .from("reservas")
      .select("id, habitacion")
      .lte("fecha_in", todayStr)
      .gt("fecha_out", todayStr)
      .not("estado_reserva", "in", "(cancelada,no_show)");
    hkReservaMap = (reservasActivas ?? []).reduce((acc: any, r: any) => {
      acc[r.habitacion] = r.id;
      return acc;
    }, {});
  } catch {
    // Si la migration 0014 aún no está aplicada, hkRows queda vacío
  }

  return (
    <div>
      <PageHeader
        title="Resumen"
        description={`Casa Mendilore · ${formatDate(todayStr, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      />

      <SyncStatusBanner />
      <AlertasInlineBlock />
      <TesoreriaBlock />

      <ResumenConfigurable data={kpisData as any} />

      {/* El aviso de sábanas de arriba trae aquí: solo se enseña cuando alguna
          habitación ocupada pasa de la cadencia de cambio de sábanas. */}
      {hkRows.some((r) => r.noches_desde_ultimo_cambio_sabanas >= hkConfig.cadencia_sabanas) && (
        <div id="housekeeping" className="mt-6 scroll-mt-6">
          <HousekeepingBlock rows={hkRows} config={hkConfig} reservaIdByHabitacion={hkReservaMap} />
        </div>
      )}

      {cobros14d && cobros14d.length > 0 && (
        <div className="bg-card border border-border rounded-xl mb-6 mt-6">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground">Cobros pendientes próximos al check-in</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cobros14d.length} {cobros14d.length === 1 ? "reserva" : "reservas"} con entrada en los próximos 14 días sin cobrar
              </p>
            </div>
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-full">
              {formatCurrency(cobros14d.reduce((acc: number, r: any) => acc + Number(r.importe_total || 0), 0))}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Huésped</th>
                  <th className="text-left font-medium px-5 py-2.5">Habitación</th>
                  <th className="text-left font-medium px-5 py-2.5">Check-in</th>
                  <th className="text-left font-medium px-5 py-2.5">Días restantes</th>
                  <th className="text-right font-medium px-5 py-2.5">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cobros14d.map((r: any) => {
                  const dias = Math.round((new Date(r.fecha_in).getTime() - new Date(todayStr).getTime()) / 86400_000);
                  const urgenciaColor = dias <= 3 ? "text-red-700 dark:text-red-400 font-semibold" : dias <= 7 ? "text-amber-700 dark:text-amber-400 font-medium" : "text-foreground";
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 text-foreground">{r.huespedes?.nombre ?? "—"}</td>
                      <td className="px-5 py-3 capitalize">{r.habitacion}</td>
                      <td className="px-5 py-3">{formatDate(r.fecha_in)}</td>
                      <td className={`px-5 py-3 ${urgenciaColor}`}>
                        {dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`}
                      </td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(r.importe_total, r.importe_moneda)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}





