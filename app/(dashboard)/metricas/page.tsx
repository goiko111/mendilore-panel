export const runtime = 'edge';

import { LineChart as LineChartIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatCard } from "@/components/page-header";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { MetricasChart } from "./chart";

export const metadata = { title: "Métricas" };

export default async function MetricasPage() {
  const supabase = await createClient();
  const today = new Date();
  const desde = new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
  // Rango extendido para el gráfico: 60d atrás → 90d adelante (cubre histórico + pipeline)
  const desdeChart = new Date(today.getTime() - 60 * 86400_000).toISOString().slice(0, 10);
  const hastaChart = new Date(today.getTime() + 90 * 86400_000).toISOString().slice(0, 10);

  // KPIs últimos 30 días (sin futuro)
  const { data: metricas30 } = await supabase
    .from("metricas_dia")
    .select("fecha, occupancy_pct, adr, revpar, ingresos_dia, habitaciones_ocupadas")
    .gte("fecha", desde)
    .lte("fecha", today.toISOString().slice(0, 10))
    .order("fecha", { ascending: true });

  // KPIs 30 días año anterior (comparativa)
  const desdeYA = new Date(today.getTime() - 395 * 86400_000).toISOString().slice(0, 10);
  const hastaYA = new Date(today.getTime() - 365 * 86400_000).toISOString().slice(0, 10);
  const { data: metricasYA } = await supabase
    .from("metricas_dia")
    .select("fecha, occupancy_pct, adr, ingresos_dia, habitaciones_ocupadas")
    .gte("fecha", desdeYA)
    .lte("fecha", hastaYA);

  // Datos para el gráfico (rango extendido)
  const { data: metricasChart } = await supabase
    .from("metricas_dia")
    .select("fecha, occupancy_pct, adr, revpar, ingresos_dia, habitaciones_ocupadas")
    .gte("fecha", desdeChart)
    .lte("fecha", hastaChart)
    .order("fecha", { ascending: true });

  // Agregados últimos 30 días
  const totalIngresos = (metricas30 ?? []).reduce((sum, m) => sum + Number(m.ingresos_dia ?? 0), 0);
  const totalNoches = (metricas30 ?? []).reduce((sum, m) => sum + Number(m.habitaciones_ocupadas ?? 0), 0);
  const occupancyMedia = metricas30?.length
    ? (metricas30.reduce((sum, m) => sum + Number(m.occupancy_pct ?? 0), 0) / metricas30.length)
    : 0;
  const adrMedio = totalNoches > 0 ? totalIngresos / totalNoches : 0;

  // Comparativa año anterior
  const totalIngresosYA = (metricasYA ?? []).reduce((sum, m) => sum + Number(m.ingresos_dia ?? 0), 0);
  const totalNochesYA = (metricasYA ?? []).reduce((sum, m) => sum + Number(m.habitaciones_ocupadas ?? 0), 0);
  const occupancyYA = metricasYA?.length
    ? (metricasYA.reduce((sum, m) => sum + Number(m.occupancy_pct ?? 0), 0) / metricasYA.length)
    : 0;
  const adrYA = totalNochesYA > 0 ? totalIngresosYA / totalNochesYA : 0;

  function varPct(now: number, before: number): string | null {
    if (!before || before === 0) return null;
    const d = ((now - before) / before) * 100;
    const sign = d > 0 ? "+" : "";
    return `${sign}${d.toFixed(1)}%`;
  }
  const hayComparativa = totalNochesYA > 0;

  // ===========================
  // KPIs MrPlan: Lead time, Cancel rate, Pace, Channel mix
  // ===========================
  const hace90d = new Date(today.getTime() - 90 * 86400_000).toISOString();
  const hace7d = new Date(today.getTime() - 7 * 86400_000).toISOString();
  const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const finMes = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const hace30d = new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  // Lead time: días entre created_at y fecha_in (reservas confirmadas últimos 90d)
  const { data: leadRows } = await supabase
    .from("reservas")
    .select("fecha_in, created_at, estado_cobro")
    .gte("created_at", hace90d)
    .neq("estado_cobro", "cancelado");
  const leadTimes = (leadRows ?? [])
    .map((r) => {
      const ci = new Date(r.fecha_in as string).getTime();
      const ca = new Date(r.created_at as string).getTime();
      return (ci - ca) / 86400_000;
    })
    .filter((d) => d >= 0 && d <= 365);
  const leadTimeMedio = leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;

  // Cancel rate: este mes natural
  const { data: mesRows } = await supabase
    .from("reservas")
    .select("estado_cobro")
    .gte("fecha_in", inicioMes)
    .lte("fecha_in", finMes);
  const totalMes = (mesRows ?? []).length;
  const canceladasMes = (mesRows ?? []).filter((r) => r.estado_cobro === "cancelado").length;
  const cancelRate = totalMes > 0 ? (canceladasMes / totalMes) * 100 : 0;

  // Pace: bookings creados últimos 7d para fechas futuras
  const { data: paceRows } = await supabase
    .from("reservas")
    .select("id, importe_total, fecha_in")
    .gte("created_at", hace7d)
    .gte("fecha_in", todayStr)
    .neq("estado_cobro", "cancelado");
  const paceCount = (paceRows ?? []).length;
  const paceRevenue = (paceRows ?? []).reduce((sum, r) => sum + Number(r.importe_total ?? 0), 0);

  // Channel mix: ingresos por canal últimos 30d
  const { data: canalRows } = await supabase
    .from("reservas")
    .select("canal, importe_total")
    .gte("fecha_in", hace30d)
    .lte("fecha_in", todayStr)
    .neq("estado_cobro", "cancelado");
  const canalMap = new Map<string, { count: number; revenue: number }>();
  (canalRows ?? []).forEach((r) => {
    const k = (r.canal as string) || "Sin canal";
    const acc = canalMap.get(k) ?? { count: 0, revenue: 0 };
    acc.count += 1;
    acc.revenue += Number(r.importe_total ?? 0);
    canalMap.set(k, acc);
  });
  const channelMix = Array.from(canalMap.entries())
    .map(([canal, v]) => ({ canal, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
  const totalChannelRevenue = channelMix.reduce((s, c) => s + c.revenue, 0);

  // Recortar el rango del gráfico a la ventana con datos relevantes
  // (primer día con reserva → último día con reserva + 7d de margen)
  const diasConDatos = (metricasChart ?? []).filter((m) => Number(m.habitaciones_ocupadas ?? 0) > 0);
  const datosChart = (() => {
    if (!metricasChart || metricasChart.length === 0) return [];
    if (diasConDatos.length === 0) return metricasChart;
    const primero = diasConDatos[0].fecha;
    const ultimoIdx = diasConDatos.length - 1;
    const ultimo = diasConDatos[ultimoIdx].fecha;
    const ultimoExtendido = new Date(new Date(ultimo).getTime() + 7 * 86400_000).toISOString().slice(0, 10);
    return metricasChart.filter((m) => m.fecha >= primero && m.fecha <= ultimoExtendido);
  })();

  // Agregar por semana para visualización más limpia
  const porSemana = (() => {
    const map = new Map<string, { fecha: string; occupancy_pct: number; adr: number; revpar: number; ingresos_dia: number; habitaciones_ocupadas: number; count: number }>();
    datosChart.forEach((m) => {
      const d = new Date(m.fecha);
      const dia = d.getUTCDay();
      // Llevar a lunes de esa semana
      const offset = dia === 0 ? -6 : 1 - dia;
      const lunes = new Date(d.getTime() + offset * 86400_000).toISOString().slice(0, 10);
      const acc = map.get(lunes) ?? { fecha: lunes, occupancy_pct: 0, adr: 0, revpar: 0, ingresos_dia: 0, habitaciones_ocupadas: 0, count: 0 };
      acc.occupancy_pct += Number(m.occupancy_pct ?? 0);
      acc.adr += Number(m.adr ?? 0);
      acc.revpar += Number(m.revpar ?? 0);
      acc.ingresos_dia += Number(m.ingresos_dia ?? 0);
      acc.habitaciones_ocupadas += Number(m.habitaciones_ocupadas ?? 0);
      acc.count += 1;
      map.set(lunes, acc);
    });
    return Array.from(map.values())
      .map((s) => ({
        fecha: s.fecha,
        occupancy_pct: s.count > 0 ? s.occupancy_pct / s.count : 0,
        adr: s.habitaciones_ocupadas > 0 ? s.ingresos_dia / s.habitaciones_ocupadas : 0,
        revpar: s.count > 0 ? s.revpar / s.count : 0,
        ingresos_semana: s.ingresos_dia,
        noches: s.habitaciones_ocupadas
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  })();

  return (
    <div>
      <PageHeader
        title="Métricas"
        description="KPIs de los últimos 30 días · Casa Mendilore"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Ocupación media" value={formatPercent(occupancyMedia)} hint={hayComparativa ? `${varPct(occupancyMedia, occupancyYA) ?? "—"} vs año anterior` : "Últimos 30 días"} />
        <StatCard label="ADR medio" value={formatCurrency(adrMedio)} hint={hayComparativa ? `${varPct(adrMedio, adrYA) ?? "—"} vs año anterior` : `${totalNoches} noches vendidas`} />
        <StatCard label="Ingresos 30 días" value={formatCurrency(totalIngresos)} hint={hayComparativa ? `${varPct(totalIngresos, totalIngresosYA) ?? "—"} vs año anterior` : "Suma diaria"} />
        <StatCard label="Noches vendidas" value={String(totalNoches)} hint={hayComparativa ? `${varPct(totalNoches, totalNochesYA) ?? "—"} vs año anterior` : "De 180 disponibles (6 hab × 30 días)"} />
      </div>

      {!hayComparativa && (
        <div className="text-xs text-muted-foreground italic mb-6 px-1">
          Comparativa año anterior aparecerá cuando haya histórico de 365 días en BD.
        </div>
      )}

      {/* KPIs operacionales MrPlan: Lead time / Cancel rate / Pace */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Lead time medio"
          value={leadTimes.length > 0 ? `${leadTimeMedio.toFixed(1)} d` : "—"}
          hint={leadTimes.length > 0 ? `${leadTimes.length} reservas últ. 90 d` : "Sin datos"}
        />
        <StatCard
          label="Cancel rate (mes)"
          value={totalMes > 0 ? `${cancelRate.toFixed(1)}%` : "—"}
          hint={totalMes > 0 ? `${canceladasMes} canceladas de ${totalMes}` : "Sin reservas este mes"}
        />
        <StatCard
          label="Pace 7 d → futuro"
          value={String(paceCount)}
          hint={paceCount > 0 ? `${formatCurrency(paceRevenue)} pipeline futuro` : "Sin reservas nuevas"}
        />
      </div>

      {/* Channel mix: distribución revenue por canal últimos 30 d */}
      {channelMix.length > 0 && totalChannelRevenue > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h2 className="text-base font-semibold text-foreground mb-1">Channel mix — últimos 30 días</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Distribución de ingresos por canal de origen · {formatCurrency(totalChannelRevenue)} totales · {(canalRows ?? []).length} reservas
          </p>
          <div className="space-y-3">
            {channelMix.map((c) => {
              const pct = (c.revenue / totalChannelRevenue) * 100;
              return (
                <div key={c.canal}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-foreground capitalize">{c.canal}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatCurrency(c.revenue)} · {pct.toFixed(0)}% · {c.count} resv.
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GA4 visitas web — CTA externo a Looker Studio (no embed por limitación de cookies de terceros) */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground mb-1">Visitas web — mendilore.com</h2>
            <p className="text-xs text-muted-foreground">
              Sesiones, usuarios, top pages y fuentes de tráfico en directo desde GA4 (informe Looker Studio).
            </p>
          </div>
          <a
            href="https://lookerstudio.google.com/reporting/11962e47-595d-43bc-bee9-86a67fad77b3"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Abrir Looker Studio ↗
          </a>
        </div>
      </div>

      {!porSemana || porSemana.length === 0 ? (
        <EmptyState
          title="Sin datos de métricas"
          description="Las métricas se calculan automáticamente desde la tabla de reservas. Importa o sincroniza reservas para ver gráficas."
          icon={<LineChartIcon className="size-5" />}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Evolución semanal</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Ocupación %, ADR € y RevPAR € agregados por semana · {formatDate(porSemana[0].fecha)} → {formatDate(porSemana[porSemana.length - 1].fecha)}
          </p>
          <MetricasChart data={porSemana as any} />
        </div>
      )}
    </div>
  );
}
