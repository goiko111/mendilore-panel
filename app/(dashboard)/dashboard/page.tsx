export const runtime = 'edge';

import { CalendarRange, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, EmptyState } from "@/components/page-header";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";

export const metadata = { title: "Resumen" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const in14Days = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  // KPIs hoy (vista metricas_dia)
  const { data: metricaHoy } = await supabase.from("metricas_dia").select("*").eq("fecha", today).single();

  // Reservas próximos 30 días
  const { data: reservasProximas, count } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, importe_total, importe_moneda, estado_cobro, canal, huespedes(nombre)", { count: "exact" })
    .gte("fecha_in", today)
    .lte("fecha_in", in30Days)
    .order("fecha_in", { ascending: true })
    .limit(8);

  // Cobros pendientes con check-in en los próximos 14 días (ventana de cobro 14d - propuesta v4 sección 3.3)
  const { data: cobrosPendientes } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, importe_total, importe_moneda, canal, huespedes(nombre)")
    .eq("estado_cobro", "pendiente")
    .in("estado_reserva", ["confirmada", "completada"])
    .gte("fecha_in", today)
    .lte("fecha_in", in14Days)
    .order("fecha_in", { ascending: true });

  return (
    <div>
      <PageHeader
        title="Resumen"
        description={`Casa Mendilore · ${formatDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Ocupación hoy" value={formatPercent(metricaHoy?.occupancy_pct)} hint={`${metricaHoy?.habitaciones_ocupadas ?? 0} / ${metricaHoy?.habitaciones_totales ?? 6} habitaciones`} />
        <StatCard label="ADR hoy" value={formatCurrency(metricaHoy?.adr)} hint="Tarifa media por habitación" />
        <StatCard label="RevPAR hoy" value={formatCurrency(metricaHoy?.revpar)} hint="Ingreso por habitación disponible" />
        <StatCard label="Reservas próximas" value={String(count ?? 0)} hint="Entradas próximos 30 días" />
      </div>

      {cobrosPendientes && cobrosPendientes.length > 0 && (
        <div className="bg-card border border-border rounded-xl mb-8">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground">Cobros pendientes próximos al check-in</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cobrosPendientes.length} {cobrosPendientes.length === 1 ? "reserva" : "reservas"} con entrada en los próximos 14 días sin cobrar
              </p>
            </div>
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1 rounded-full">
              {formatCurrency(cobrosPendientes.reduce((acc: number, r: any) => acc + Number(r.importe_total || 0), 0))}
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
                  <th className="text-left font-medium px-5 py-2.5">Canal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cobrosPendientes.map((r: any) => {
                  const dias = Math.round((new Date(r.fecha_in).getTime() - new Date(today).getTime()) / 86400_000);
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
                      <td className="px-5 py-3 text-muted-foreground">{r.canal ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Próximas entradas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Reservas con check-in en los próximos 30 días</p>
        </div>

        {!reservasProximas || reservasProximas.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Aún no hay reservas"
              description="Cuando integremos MisterPlan, las reservas aparecerán aquí automáticamente. Mientras tanto puedes añadirlas manualmente desde Reservas."
              icon={<CalendarRange className="size-5" />}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Huésped</th>
                  <th className="text-left font-medium px-5 py-2.5">Habitación</th>
                  <th className="text-left font-medium px-5 py-2.5">Check-in</th>
                  <th className="text-left font-medium px-5 py-2.5">Noches</th>
                  <th className="text-right font-medium px-5 py-2.5">Importe</th>
                  <th className="text-left font-medium px-5 py-2.5">Estado</th>
                  <th className="text-left font-medium px-5 py-2.5">Canal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reservasProximas.map((r: any) => {
                  const noches = Math.round((new Date(r.fecha_out).getTime() - new Date(r.fecha_in).getTime()) / 86400_000);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 text-foreground">{r.huespedes?.nombre ?? "—"}</td>
                      <td className="px-5 py-3 capitalize">{r.habitacion}</td>
                      <td className="px-5 py-3">{formatDate(r.fecha_in)}</td>
                      <td className="px-5 py-3">{noches}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(r.importe_total, r.importe_moneda)}</td>
                      <td className="px-5 py-3"><EstadoCobroBadge estado={r.estado_cobro} /></td>
                      <td className="px-5 py-3 text-muted-foreground">{r.canal ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EstadoCobroBadge({ estado }: { estado: string }) {
  const colorMap: Record<string, string> = {
    cobrado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    pendiente: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    fallido: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    reembolsado: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400",
    no_aplica: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400"
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[estado] ?? colorMap.no_aplica}`}>
      {estado}
    </span>
  );
}
