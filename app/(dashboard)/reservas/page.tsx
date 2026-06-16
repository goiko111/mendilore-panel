export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { CalendarRange, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AccionesReserva } from "./acciones-reserva";

export const metadata = { title: "Reservas" };

const HABITACIONES = ["cala", "nube", "margarita", "lino", "limonero", "lavanda"];
const ESTADOS_COBRO = ["cobrado", "pendiente", "fallido", "reembolsado", "no_aplica"];
const ESTADOS_RESERVA = ["confirmada", "completada", "cancelada", "no_show", "pendiente"];
const CANALES = ["directo", "booking", "airbnb", "expedia", "web_propia", "walk_in", "otro"];

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
  const today = new Date().toISOString().slice(0, 10);

  // Orden inteligente según el filtro temporal
  const ascending = tiempo === "futuras";

  let query = supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, noches, importe_total, importe_moneda, estado_reserva, estado_cobro, canal, huespedes(nombre, apellidos, email)")
    .order("fecha_in", { ascending })
    .limit(1000);

  if (tiempo === "futuras") query = query.gte("fecha_in", today);
  if (tiempo === "pasadas") query = query.lt("fecha_in", today);
  if (sp.habitacion) query = query.eq("habitacion", sp.habitacion);
  if (sp.estado_cobro) query = query.eq("estado_cobro", sp.estado_cobro);
  if (sp.estado_reserva) query = query.eq("estado_reserva", sp.estado_reserva);
  if (sp.canal) query = query.eq("canal", sp.canal);
  if (sp.desde) query = query.gte("fecha_in", sp.desde);
  if (sp.hasta) query = query.lte("fecha_in", sp.hasta);
  if (sp.id) query = query.eq("id", sp.id);

  const { data: reservasRaw } = await query;

  // Cargar aceptaciones de las reservas mostradas (Fase 3)
  const reservaIds = (reservasRaw ?? []).map((r: any) => r.id);
  const { data: aceptacionesData } = reservaIds.length
    ? await supabase
        .from("aceptaciones_condiciones")
        .select("reserva_id")
        .in("reserva_id", reservaIds)
    : { data: [] };
  const aceptadas = new Set<string>((aceptacionesData ?? []).map((a: any) => a.reserva_id));

  // Filtro client-side por texto libre (q) sobre nombre/email del huésped
  const q = sp.q?.toLowerCase().trim();
  const reservas = q
    ? (reservasRaw ?? []).filter((r: any) => {
        const h = r.huespedes as any;
        const txt = `${h?.nombre ?? ""} ${h?.apellidos ?? ""} ${h?.email ?? ""}`.toLowerCase();
        return txt.includes(q);
      })
    : (reservasRaw ?? []);

  const totalImporte = reservas.reduce((acc: number, r: any) => acc + Number(r.importe_total || 0), 0);
  const totalNoches = reservas.reduce((acc: number, r: any) => acc + Number(r.noches || 0), 0);
  const totalFuturas = reservas.filter((r: any) => r.fecha_in >= today).length;
  const totalPasadas = reservas.filter((r: any) => r.fecha_in < today).length;
  const totalCobrado = reservas.filter((r: any) => r.estado_cobro === "cobrado").reduce((acc: number, r: any) => acc + Number(r.importe_total || 0), 0);
  const totalPendiente = reservas.filter((r: any) => r.estado_cobro === "pendiente").reduce((acc: number, r: any) => acc + Number(r.importe_total || 0), 0);

  // URL de exportación con los mismos filtros aplicados
  const exportParams = new URLSearchParams();
  if (sp.desde) exportParams.set("from", sp.desde);
  if (sp.hasta) exportParams.set("to", sp.hasta);
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
        description={`${reservas.length} reservas · ${totalNoches} noches · ${formatCurrency(totalImporte)} total · ✅ ${formatCurrency(totalCobrado)} cobrado · 🟡 ${formatCurrency(totalPendiente)} pendiente · ${totalFuturas} futuras / ${totalPasadas} pasadas`}
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
        <strong className="font-semibold">¿Para qué sirve esta pantalla?</strong> Complementa a MisterPlan con tres cosas que MrPlan no hace: exportación a Excel del histórico para contabilidad y subvenciones, botón rápido para marcar cobros sin entrar a MrPlan y envío del enlace de aceptación legal por reserva (Fase 3).
      </div>

      {/* Filtro temporal pestañas */}
      <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border border-border w-fit mb-5">
        {([
          { key: "todas" as Tiempo, label: `Todas (${reservas.length})` },
          { key: "futuras" as Tiempo, label: `Futuras (${totalFuturas})` },
          { key: "pasadas" as Tiempo, label: `Pasadas (${totalPasadas})` }
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
          {CANALES.map((c) => <option key={c} value={c}>{c}</option>)}
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
                <th className="text-left font-medium px-5 py-2.5">Huésped</th>
                <th className="text-left font-medium px-5 py-2.5">Habitación</th>
                <th className="text-left font-medium px-5 py-2.5">Entrada</th>
                <th className="text-left font-medium px-5 py-2.5">Salida</th>
                <th className="text-right font-medium px-5 py-2.5">Noches</th>
                <th className="text-right font-medium px-5 py-2.5">Importe</th>
                <th className="text-left font-medium px-5 py-2.5">Reserva</th>
                <th className="text-left font-medium px-5 py-2.5">Cobro</th>
                <th className="text-left font-medium px-5 py-2.5">Canal</th>
                <th className="text-left font-medium px-5 py-2.5">Firma legal</th>
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
                    <td className="px-5 py-3 text-muted-foreground">{r.canal ?? "—"}</td>
                    <td className="px-5 py-3">
                      {(() => {
                        const firmada = aceptadas.has(r.id);
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
                    <td className="px-5 py-3"><AccionesReserva id={r.id} estado_cobro={r.estado_cobro} huesped_email={(r.huespedes as any)?.email} /></td>
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
