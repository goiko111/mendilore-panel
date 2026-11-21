export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { CalendarRange, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AccionesReserva } from "./acciones-reserva";
import { HABITACIONES_VALIDAS , canalLabel, CANALES as CANALES_ALL } from "@/lib/constants";
import { hoyMadrid } from "@/lib/fechas";
import { inicioHistorico, mesYAnio } from "@/lib/historico";

export const metadata = { title: "Reservas" };

const HABITACIONES = ["cala", "nube", "margarita", "lino", "limonero", "lavanda"];
const ESTADOS_COBRO = ["cobrado", "pendiente", "fallido", "reembolsado", "no_aplica"];
const ESTADOS_RESERVA = ["confirmada", "completada", "cancelada", "no_show", "pendiente"];
const CANALES = CANALES_ALL;

type Tiempo = "todas" | "futuras" | "pasadas";

type SearchParams = {
  q?: string;
  habitacion?: string;
  estado_cobro?: string;
  estado_reserva?: string;
  canal?: string;
  desde?: string;
  hasta?: string;
  id?: string;
  t?: Tiempo;
};

export default async function ReservasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tiempo: Tiempo = (sp.t === "futuras" || sp.t === "pasadas" || sp.t === "todas") ? sp.t : "todas";
  const supabase = await createClient();
  // Feedback Juan 21/11: decir en la cabecera desde cuándo hay datos cargados
  const historicoDesde = await inicioHistorico(supabase);
  const today = hoyMadrid();

  // Orden inteligente según el filtro temporal
  const ascending = tiempo === "futuras";

  // Futuras / Pasadas se filtran después, para que los números de las tres
  // pestañas salgan siempre sobre el mismo conjunto (antes, en "Futuras" la
  // pestaña "Pasadas" marcaba 0). Se lee por páginas: Supabase da 1.000 filas
  // como mucho por consulta.
  const reservasRaw: any[] = [];
  for (let i = 0; i < 20000; i += 1000) {
    let query = supabase
      .from("reservas")
      .select("id, habitacion, fecha_in, fecha_out, noches, importe_total, importe_moneda, estado_reserva, estado_cobro, canal, id_externo_misterplan, huespedes(nombre, apellidos, email)")
      .order("fecha_in", { ascending })
      .order("id_externo_misterplan", { ascending: true })
      .order("habitacion", { ascending: true })
      .in("habitacion", HABITACIONES_VALIDAS as unknown as string[])
      .range(i, i + 999);
    if (sp.habitacion) query = query.eq("habitacion", sp.habitacion);
    if (sp.estado_cobro) query = query.eq("estado_cobro", sp.estado_cobro);
    if (sp.estado_reserva) query = query.eq("estado_reserva", sp.estado_reserva);
    if (sp.canal) query = query.eq("canal", sp.canal);
    if (sp.desde) query = query.gte("fecha_in", sp.desde);
    if (sp.hasta) query = query.lte("fecha_in", sp.hasta);
    if (sp.id) query = query.eq("id", sp.id);
    const { data } = await query;
    reservasRaw.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // Cargar aceptaciones de las reservas mostradas (Fase 3)
  //  Se leen todas (es una tabla pequeña): con cientos de reservas, pasar sus
  //  ids en la consulta hace una URL demasiado larga y la consulta fallaba en
  //  silencio, con lo que ninguna reserva salía firmada.
  const aceptadas = new Set<string>();
  for (let i = 0; i < 50000; i += 1000) {
    const { data } = await supabase
      .from("aceptaciones_condiciones")
      .select("reserva_id")
      .not("reserva_id", "is", null)
      .range(i, i + 999);
    for (const a of data ?? []) aceptadas.add((a as any).reserva_id);
    if (!data || data.length < 1000) break;
  }
  // La firma va por reserva, no por habitación (feedback Juan nov: una
  // reserva de 6 habitaciones salía como 6 procesos). Solo la primera fila de
  // cada reserva muestra el estado y el botón; si cualquier habitación está
  // firmada, la reserva entera lo está.
  const claveReserva = (r: any) => r.id_externo_misterplan || r.id;
  const primeraFila = new Map<string, string>();
  const reservaFirmada = new Set<string>();
  for (const r of reservasRaw ?? []) {
    if (!primeraFila.has(claveReserva(r))) primeraFila.set(claveReserva(r), r.id);
    if (aceptadas.has(r.id)) reservaFirmada.add(claveReserva(r));
  }

  // Filtro client-side por texto libre (q) sobre nombre/email del huésped
  const q = sp.q?.toLowerCase().trim();
  const filtradas = q
    ? (reservasRaw ?? []).filter((r: any) => {
        const h = r.huespedes as any;
        const txt = `${h?.nombre ?? ""} ${h?.apellidos ?? ""} ${h?.email ?? ""}`.toLowerCase();
        return txt.includes(q);
      })
    : (reservasRaw ?? []);
  const numFuturas = filtradas.filter((r: any) => r.fecha_in >= today).length;
  const numPasadas = filtradas.length - numFuturas;
  const reservas = tiempo === "futuras" ? filtradas.filter((r: any) => r.fecha_in >= today)
    : tiempo === "pasadas" ? filtradas.filter((r: any) => r.fecha_in < today)
    : filtradas;

  const totalImporte = reservas.reduce((acc: number, r: any) => acc + Number(r.importe_total || 0), 0);
  const totalNoches = reservas.reduce((acc: number, r: any) => acc + Number(r.noches || 0), 0);
  const numReservas = new Set(reservas.map((r: any) => r.id_externo_misterplan || r.id)).size;
  const totalCobrado = reservas.filter((r: any) => r.estado_cobro === "cobrado").reduce((acc: number, r: any) => acc + Number(r.importe_total || 0), 0);
  const totalPendiente = reservas.filter((r: any) => r.estado_cobro === "pendiente").reduce((acc: number, r: any) => acc + Number(r.importe_total || 0), 0);

  // URL de exportación con los mismos filtros aplicados
  const exportParams = new URLSearchParams();
  if (tiempo !== "todas") exportParams.set("t", tiempo);
  if (sp.q) exportParams.set("q", sp.q);
  if (sp.habitacion) exportParams.set("habitacion", sp.habitacion);
  if (sp.estado_cobro) exportParams.set("estado_cobro", sp.estado_cobro);
  if (sp.estado_reserva) exportParams.set("estado_reserva", sp.estado_reserva);
  if (sp.canal) exportParams.set("canal", sp.canal);
  if (sp.desde) exportParams.set("desde", sp.desde);
  if (sp.hasta) exportParams.set("hasta", sp.hasta);
  const exportUrl = exportParams.toString() ? `/api/export/reservas?${exportParams}` : "/api/export/reservas";

  // Helper para mantener otros params al cambiar tiempo
  const buildHref = (t: Tiempo) => {
    const p = new URLSearchParams();
    if (t !== "todas") p.set("t", t);
    if (sp.q) p.set("q", sp.q);
    if (sp.habitacion) p.set("habitacion", sp.habitacion);
    if (sp.estado_cobro) p.set("estado_cobro", sp.estado_cobro);
    if (sp.canal) p.set("canal", sp.canal);
    if (sp.desde) p.set("desde", sp.desde);
    if (sp.hasta) p.set("hasta", sp.hasta);
    if (sp.estado_reserva) p.set("estado_reserva", sp.estado_reserva);
    const s = p.toString();
    return s ? `/reservas?${s}` : "/reservas";
  };

  return (
    <div>
      <PageHeader
        title="Reservas y exportación"
        description={`${numReservas} reservas (${reservas.length} habitaciones) · ${totalNoches} noches · ${formatCurrency(totalImporte)} total · ✅ ${formatCurrency(totalCobrado)} cobrado · 🟡 ${formatCurrency(totalPendiente)} pendiente${historicoDesde ? ` · datos cargados desde ${mesYAnio(historicoDesde)}` : ""}`}
        actions={
          <Link
            href={exportUrl}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-foreground text-background hover:bg-foreground/90 px-3 py-1.5 rounded-md transition"
          >
            <Download className="size-3.5" />
            Exportar CSV
          </Link>
        }
      />
      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-lg p-3 mb-4 text-xs text-emerald-900 dark:text-emerald-200">
        <strong className="font-semibold">¿Para qué sirve esta pantalla?</strong> Complementa a MisterPlan con dos cosas que MrPlan no hace: exportar a Excel (CSV) las reservas que estás viendo, con los mismos filtros, y enviar al huésped el enlace para aceptar las condiciones, una vez por reserva. Los cobros se registran en MisterPlan: el panel los recoge en la siguiente sincronización.
      </div>

      {/* Filtro temporal pestañas */}
      <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border border-border w-fit mb-5">
        {([
          { key: "todas" as Tiempo, label: `Todas (${filtradas.length})` },
          { key: "futuras" as Tiempo, label: `Futuras (${numFuturas})` },
          { key: "pasadas" as Tiempo, label: `Pasadas (${numPasadas})` }
        ]).map((opt) => (
          <Link
            key={opt.key}
            href={buildHref(opt.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition ${
              tiempo === opt.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <form method="get" className="bg-card border border-border rounded-xl p-4 mb-5 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
        <input type="hidden" name="t" value={tiempo} />
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar huésped / email"
          className="md:col-span-2 px-3 py-1.5 rounded-md border border-border bg-background text-foreground"
        />
        <select name="habitacion" defaultValue={sp.habitacion ?? ""} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground capitalize">
          <option value="">Habitación: todas</option>
          {HABITACIONES.map((h) => <option key={h} value={h} className="capitalize">{h}</option>)}
        </select>
        <select name="estado_cobro" defaultValue={sp.estado_cobro ?? ""} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground">
          <option value="">Cobro: todos</option>
          {ESTADOS_COBRO.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select name="canal" defaultValue={sp.canal ?? ""} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground">
          <option value="">Canal: todos</option>
          {CANALES.map((c) => <option key={c} value={c}>{canalLabel(c)}</option>)}
        </select>
        <div className="flex gap-2">
          <button type="submit" className="flex-1 bg-foreground text-background hover:bg-foreground/90 px-3 py-1.5 rounded-md font-medium">
            Filtrar
          </button>
          <Link href="/reservas" className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition">
            ✕
          </Link>
        </div>
        <input
          type="date"
          name="desde"
          defaultValue={sp.desde ?? ""}
          placeholder="Desde"
          className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground"
        />
        <input
          type="date"
          name="hasta"
          defaultValue={sp.hasta ?? ""}
          placeholder="Hasta"
          className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground"
        />
        <select name="estado_reserva" defaultValue={sp.estado_reserva ?? ""} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground">
          <option value="">Reserva: todas</option>
          {ESTADOS_RESERVA.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </form>

      {reservas.length === 0 ? (
        <EmptyState
          title="Ningún resultado con esos filtros"
          description="Prueba a quitar filtros o cambiar el rango de fechas."
          icon={<CalendarRange className="size-5" />}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2.5" title="Persona titular de la reserva (nombre completo). Datos sincronizados desde MisterPlan.">Huésped</th>
                <th className="text-left font-medium px-5 py-2.5" title="Una de las 6 habitaciones: Cala, Nube, Margarita, Lino, Limonero o Lavanda.">Habitación</th>
                <th className="text-left font-medium px-5 py-2.5" title="Fecha de check-in del huésped (formato día/mes/año).">Entrada</th>
                <th className="text-left font-medium px-5 py-2.5" title="Fecha de check-out del huésped.">Salida</th>
                <th className="text-right font-medium px-5 py-2.5" title="Número de noches reservadas (fecha_out - fecha_in).">Noches</th>
                <th className="text-right font-medium px-5 py-2.5" title="Importe total de la reserva en euros (alojamiento + complementarios). Origen: MisterPlan.">Importe</th>
                <th className="text-left font-medium px-5 py-2.5" title="Estado de la reserva: confirmada, completada, cancelada, no_show o pendiente. Origen: MisterPlan.">Reserva</th>
                <th className="text-left font-medium px-5 py-2.5" title="Estado del cobro: cobrado, pendiente, fallido, reembolsado o no_aplica. Origen: MisterPlan.">Cobro</th>
                <th className="text-left font-medium px-5 py-2.5" title="Canal de venta: Booking, Web propia (motor de reservas), Teléfono / manual (metidas a mano en MisterPlan) u otros.">Canal</th>
                <th className="text-left font-medium px-5 py-2.5" title="Estado de la aceptación de condiciones particulares por el huésped (política de cancelación, mascotas, etc.). Verde si firmada, rojo/naranja según urgencia si pendiente.">Firma legal</th>
                <th className="text-left font-medium px-5 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reservas.map((r: any) => {
                const esFutura = r.fecha_in >= today;
                return (
                  <tr key={r.id} className={`hover:bg-muted/30 ${esFutura ? "" : "opacity-75"}`}>
                    <td className="px-5 py-3 text-foreground">
                      {r.huespedes ? `${r.huespedes.nombre ?? ""} ${r.huespedes.apellidos ?? ""}`.trim() : "—"}
                    </td>
                    <td className="px-5 py-3 capitalize">{r.habitacion}</td>
                    <td className="px-5 py-3">{formatDate(r.fecha_in)}</td>
                    <td className="px-5 py-3">{formatDate(r.fecha_out)}</td>
                    <td className="px-5 py-3 text-right">{r.noches}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(r.importe_total, r.importe_moneda)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.estado_reserva}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.estado_cobro}</td>
                    <td className="px-5 py-3 text-muted-foreground">{canalLabel(r.canal)}</td>
                    <td className="px-5 py-3">
                      {(() => {
                        if (primeraFila.get(claveReserva(r)) !== r.id) {
                          return <span className="text-muted-foreground text-xs" title="La firma legal es una por reserva: se gestiona en la primera habitación de la lista.">misma reserva ↑</span>;
                        }
                        const firmada = reservaFirmada.has(claveReserva(r));
                        if (firmada) {
                          return <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-xs font-medium">✓ Firmada</span>;
                        }
                        // Calcular días hasta check-in
                        const ci = new Date(r.fecha_in + "T00:00:00");
                        const hoy = new Date(today + "T00:00:00");
                        const dias = Math.round((ci.getTime() - hoy.getTime()) / 86400000);
                        if (r.estado_reserva === "cancelada" || r.estado_reserva === "no_show") {
                          return <span className="text-muted-foreground text-xs">—</span>;
                        }
                        if (dias < -1) {
                          return <span className="text-muted-foreground text-xs">—</span>;
                        }
                        const color = dias <= 0 ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800" 
                                    : dias <= 1 ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800"
                                    : dias <= 3 ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                                    : "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
                        const label = dias <= 0 ? "⚠ Pendiente" : `Pendiente (${dias}d)`;
                        return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${color}`}>{label}</span>;
                      })()}
                    </td>
                    <td className="px-5 py-3"><AccionesReserva id={r.id} estado_cobro={r.estado_cobro} huesped_email={(r.huespedes as any)?.email} firmada={reservaFirmada.has(claveReserva(r))} mostrarLegal={primeraFila.get(claveReserva(r)) === r.id} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
