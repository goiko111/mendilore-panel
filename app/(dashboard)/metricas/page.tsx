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

      {/* GA4 — visitas web (Looker Studio embed) */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground mb-1">Visitas web — mendilore.com</h2>
            <p className="text-xs text-muted-foreground">
              Datos en directo de GA4 vía Looker Studio · sesiones, usuarios, top pages, fuente de tráfico
            </p>
          </div>
          <a
            href="https://lookerstudio.google.com/reporting/11962e47-595d-43bc-bee9-86a67fad77b3"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-primary hover:underline whitespace-nowrap"
          >
            Abrir en Looker Studio ↗
          </a>
        </div>
        <div className="rounded-lg overflow-hidden border border-border bg-muted/30">
          <iframe
            src="https://lookerstudio.google.com/embed/reporting/11962e47-595d-43bc-bee9-86a67fad77b3/page/y2b0F"
            width="100%"
            height="480"
            frameBorder="0"
            allowFullScreen
            sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            title="GA4 Looker Studio Casa Mendilore"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 italic">
          Si el iframe muestra &ldquo;No has iniciado sesión&rdquo;, asegúrate de tener una cuenta Google abierta en este navegador
          (Gmail / YouTube). Es una limitación de Looker Studio. Como alternativa, abre el informe en una pestaña nueva con el enlace de arriba.
        </p>
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
