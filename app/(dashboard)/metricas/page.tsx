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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Ocupación media" value={formatPercent(occupancyMedia)} hint="Últimos 30 días" />
        <StatCard label="ADR medio" value={formatCurrency(adrMedio)} hint={`${totalNoches} noches vendidas`} />
        <StatCard label="Ingresos 30 días" value={formatCurrency(totalIngresos)} hint="Suma diaria" />
        <StatCard label="Noches vendidas" value={String(totalNoches)} hint="De 180 disponibles (6 hab × 30 días)" />
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
