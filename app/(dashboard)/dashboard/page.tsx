export const runtime = 'edge';

import Link from "next/link";
import { CalendarRange, AlertTriangle, LogIn, LogOut, Wallet, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ResumenConfigurable } from "./resumen-configurable";

export const metadata = { title: "Resumen" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 86400_000).toISOString().slice(0, 10);
  const in7Days = new Date(today.getTime() + 7 * 86400_000).toISOString().slice(0, 10);
  const in14Days = new Date(today.getTime() + 14 * 86400_000).toISOString().slice(0, 10);
  const in30Days = new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  // ============= CÁLCULO DE TODOS LOS KPIs DISPONIBLES (server-side) =============

  // A) Check-ins hoy
  const { data: checkinsHoy, count: cntCheckinsHoy } = await supabase
    .from("reservas")
    .select("id, habitacion, huespedes(nombre, apellidos), num_huespedes:numero_huespedes", { count: "exact" })
    .eq("fecha_in", todayStr)
    .neq("estado_cobro", "cancelado");

  // B) Check-outs hoy
  const { data: checkoutsHoy, count: cntCheckoutsHoy } = await supabase
    .from("reservas")
    .select("id, habitacion, huespedes(nombre, apellidos)", { count: "exact" })
    .eq("fecha_out", todayStr)
    .neq("estado_cobro", "cancelado");

  // C) Huéspedes presentes (entraron hoy o antes, salen hoy o después)
  const { count: cntPresentes } = await supabase
    .from("reservas")
    .select("id", { count: "exact", head: true })
    .lte("fecha_in", todayStr)
    .gt("fecha_out", todayStr)
    .neq("estado_cobro", "cancelado");

  // D) Llegadas mañana
  const { data: llegadasManana, count: cntLlegadasManana } = await supabase
    .from("reservas")
    .select("id, habitacion, huespedes(nombre, apellidos)", { count: "exact" })
    .eq("fecha_in", tomorrow)
    .neq("estado_cobro", "cancelado");

  // E) Cobros pendientes <7d
  const { data: cobros7d, count: cntCobros7d } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, importe_total, importe_moneda, huespedes(nombre, apellidos)", { count: "exact" })
    .eq("estado_cobro", "pendiente")
    .gte("fecha_in", todayStr)
    .lte("fecha_in", in7Days)
    .order("fecha_in", { ascending: true });
  const cobros7dImporte = (cobros7d ?? []).reduce((s: number, r: any) => s + Number(r.importe_total ?? 0), 0);

  // E2) Cobros pendientes <14d (legacy)
  const { data: cobros14d } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, importe_total, importe_moneda, huespedes(nombre, apellidos)", { count: "exact" })
    .eq("estado_cobro", "pendiente")
    .in("estado_reserva", ["confirmada", "completada"])
    .gte("fecha_in", todayStr)
    .lte("fecha_in", in14Days)
    .order("fecha_in", { ascending: true });

  // L) Pipeline próximos 30d
  const { data: pipeline30d, count: cntPipeline30d } = await supabase
    .from("reservas")
    .select("id, importe_total", { count: "exact" })
    .gte("fecha_in", todayStr)
    .lte("fecha_in", in30Days)
    .neq("estado_cobro", "cancelado");
  const pipelineRevenue = (pipeline30d ?? []).reduce((s: number, r: any) => s + Number(r.importe_total ?? 0), 0);

  // F) Habitaciones libres hoy
  const { count: cntOcupadasHoy } = await supabase
    .from("reservas")
    .select("id", { count: "exact", head: true })
    .lte("fecha_in", todayStr)
    .gt("fecha_out", todayStr)
    .neq("estado_cobro", "cancelado");
  const libresHoy = 6 - (cntOcupadasHoy ?? 0);

  // G) Próxima llegada
  const { data: proxLlegada } = await supabase
    .from("reservas")
    .select("habitacion, fecha_in, huespedes(nombre, apellidos)")
    .gt("fecha_in", todayStr)
    .neq("estado_cobro", "cancelado")
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

  // J) Ingresos vs target
  let target: { ingresos_target: number; ocupacion_target_pct: number } | null = null;
  try {
    const { data } = await supabase
      .from("objetivos_mensuales")
      .select("ingresos_target, ocupacion_target_pct")
      .eq("year", today.getFullYear())
      .eq("month", today.getMonth() + 1)
      .maybeSingle();
    target = data;
  } catch {}
  const ingresosVsTarget = target?.ingresos_target ? (ingresosMes / Number(target.ingresos_target)) * 100 : null;

  // M) Pace 7d (reservas creadas últimos 7d)
  const hace7d = new Date(today.getTime() - 7 * 86400_000).toISOString();
  const { count: cntPace7d } = await supabase
    .from("reservas")
    .select("id", { count: "exact", head: true })
    .gte("created_at", hace7d)
    .gt("fecha_in", todayStr)
    .neq("estado_cobro", "cancelado");

  // N) Cobros pendientes total
  const { data: cobrosTotal } = await supabase
    .from("reservas")
    .select("importe_total")
    .eq("estado_cobro", "pendiente");
  const cobrosTotalImporte = (cobrosTotal ?? []).reduce((s: number, r: any) => s + Number(r.importe_total ?? 0), 0);

  // V) Reservas nuevas hoy
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const { count: cntReservasHoy } = await supabase
    .from("reservas")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startToday);

  // KPIs adicionales (huéspedes etc) — calculo bajo demanda en cliente
  // Por ahora paso solo los más útiles

  // Cobrado este mes + Tasa de cobro
  const { data: reservasMes } = await supabase
    .from("reservas")
    .select("estado_cobro, importe_total")
    .gte("fecha_in", startMonth)
    .lte("fecha_in", todayStr)
    .neq("estado_reserva", "cancelada");
  const cobradoMes = (reservasMes ?? []).filter((r: any) => r.estado_cobro === "cobrado").reduce((s: number, r: any) => s + Number(r.importe_total ?? 0), 0);
  const totalReservasMes = (reservasMes ?? []).length;
  const cobradasMes = (reservasMes ?? []).filter((r: any) => r.estado_cobro === "cobrado").length;
  const tasaCobro = totalReservasMes > 0 ? (cobradasMes / totalReservasMes) * 100 : null;

  const kpisData = {
    // Operacionales
    checkins_hoy: { value: cntCheckinsHoy ?? 0, detail: (checkinsHoy ?? []).map((r: any) => `${r.huespedes?.nombre ?? '—'} · ${r.habitacion}`) },
    checkouts_hoy: { value: cntCheckoutsHoy ?? 0, detail: (checkoutsHoy ?? []).map((r: any) => `${r.huespedes?.nombre ?? '—'} · ${r.habitacion}`) },
    huespedes_presentes: { value: cntPresentes ?? 0 },
    llegadas_manana: { value: cntLlegadasManana ?? 0, detail: (llegadasManana ?? []).map((r: any) => `${r.huespedes?.nombre ?? '—'} · ${r.habitacion}`) },
    cobros_7d: { value: cntCobros7d ?? 0, importe: cobros7dImporte },
    habitaciones_libres: { value: libresHoy, total: 6 },
    proxima_llegada: { value: proxLlegada ? `${formatDate(proxLlegada.fecha_in)}` : '—', detail: proxLlegada ? `${(proxLlegada.huespedes as any)?.nombre ?? '—'} · ${proxLlegada.habitacion}` : '' },
    tareas_pendientes: { value: cntTareasHoy },
    // Financieros
    ingresos_mes: { value: ingresosMes },
    ingresos_vs_target: { value: ingresosVsTarget, target: target?.ingresos_target ? Number(target.ingresos_target) : null },
    pipeline_30d: { value: cntPipeline30d ?? 0, importe: pipelineRevenue },
    pace_7d: { value: cntPace7d ?? 0 },
    cobros_pendientes_total: { value: cobrosTotalImporte },
    // Operación
    reservas_nuevas_hoy: { value: cntReservasHoy ?? 0 },
    cobrado_mes: { value: cobradoMes },
    tasa_cobro: { value: tasaCobro, cobradas: cobradasMes, total: totalReservasMes }
  };

  return (
    <div>
      <PageHeader
        title="Resumen"
        description={`Casa Mendilore · ${formatDate(todayStr, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      />

      <ResumenConfigurable data={kpisData as any} />

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
