import { LineChart as LineChartIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatCard } from "@/components/page-header";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { MetricasChart } from "./chart";

export const metadata = { title: "Métricas" };

export default async function MetricasPage() {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  const { data: metricas } = await supabase
    .from("metricas_dia")
    .select("fecha, occupancy_pct, adr, revpar, ingresos_dia, habitaciones_ocupadas")
    .gte("fecha", desde)
    .order("fecha", { ascending: true });

  // Agregados
  const totalIngresos = (metricas ?? []).reduce((sum, m) => sum + Number(m.ingresos_dia ?? 0), 0);
  const totalNoches = (metricas ?? []).reduce((sum, m) => sum + Number(m.habitaciones_ocupadas ?? 0), 0);
  const occupancyMedia = metricas?.length
    ? (metricas.reduce((sum, m) => sum + Number(m.occupancy_pct ?? 0), 0) / metricas.length)
    : 0;
  const adrMedio = totalNoches > 0 ? totalIngresos / totalNoches : 0;

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

      {!metricas || metricas.length === 0 ? (
        <EmptyState
          title="Sin datos de métricas"
          description="Las métricas se calculan automáticamente desde la tabla de reservas. Importa o sincroniza reservas para ver gráficas."
          icon={<LineChartIcon className="size-5" />}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Evolución diaria</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Ocupación, ADR y RevPAR · {formatDate(desde)} → {formatDate(new Date())}
          </p>
          <MetricasChart data={metricas as any} />
        </div>
      )}
    </div>
  );
}
