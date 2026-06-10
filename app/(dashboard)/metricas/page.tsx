export const runtime = 'edge';

import Link from "next/link";
import { LineChart as LineChartIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatCard } from "@/components/page-header";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { MetricasChart } from "./chart";

export const metadata = { title: "Métricas" };

type Period = "7d" | "30d" | "90d" | "365d";
const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: "7d", label: "7 días", days: 7 },
  { key: "30d", label: "30 días", days: 30 },
  { key: "90d", label: "90 días", days: 90 },
  { key: "365d", label: "1 año", days: 365 }
];

export default async function MetricasPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const sp = await searchParams;
  const selected: Period = (PERIODS.find(p => p.key === sp.p)?.key ?? "30d") as Period;
  const lookbackDays = PERIODS.find(p => p.key === selected)!.days;

  const supabase = await createClient();
  const today = new Date();
  const desde = new Date(today.getTime() - lookbackDays * 86400_000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  // Rango extendido para el gráfico: 60d atrás → 90d adelante (cubre histórico + pipeline)
  const desdeChart = new Date(today.getTime() - 60 * 86400_000).toISOString().slice(0, 10);
  const hastaChart = new Date(today.getTime() + 90 * 86400_000).toISOString().slice(0, 10);

  // KPIs últimos N días (sin futuro)
  const { data: metricasPeriodo } = await supabase
    .from("metricas_dia")
    .select("fecha, occupancy_pct, adr, revpar, ingresos_dia, habitaciones_ocupadas")
    .gte("fecha", desde)
    .lte("fecha", todayStr)
    .order("fecha", { ascending: true });

  // KPIs mismo período año anterior (comparativa)
  const desdeYA = new Date(today.getTime() - (365 + lookbackDays) * 86400_000).toISOString().slice(0, 10);
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

  // Agregados último período
  const totalIngresos = (metricasPeriodo ?? []).reduce((sum, m) => sum + Number(m.ingresos_dia ?? 0), 0);
  const totalNoches = (metricasPeriodo ?? []).reduce((sum, m) => sum + Number(m.habitaciones_ocupadas ?? 0), 0);
  const occupancyMedia = metricasPeriodo?.length
    ? (metricasPeriodo.reduce((sum, m) => sum + Number(m.occupancy_pct ?? 0), 0) / metricasPeriodo.length)
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
  // KPIs MrPlan: Lead time, ALOS, Cancel rate, Pace, Channel mix
  // ===========================
  const hace90d = new Date(today.getTime() - 90 * 86400_000).toISOString();
  const hace7d = new Date(today.getTime() - 7 * 86400_000).toISOString();
  const inicioMes = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const finMes = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const hace30d = new Date(today.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
  const en30d = new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  const en60d = new Date(today.getTime() + 60 * 86400_000).toISOString().slice(0, 10);
  const en90d = new Date(today.getTime() + 90 * 86400_000).toISOString().slice(0, 10);

  // Lead time + ALOS: reservas confirmadas últimos 90d
  const { data: leadRows } = await supabase
    .from("reservas")
    .select("fecha_in, fecha_out, noches, created_at, estado_cobro")
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
  // ALOS — Average Length of Stay (basado en col 'noches' que ya tenemos)
  const nochesArr = (leadRows ?? []).map((r) => Number(r.noches ?? 0)).filter((n) => n > 0);
  const alosMedio = nochesArr.length > 0 ? nochesArr.reduce((a, b) => a + b, 0) / nochesArr.length : 0;

  // Cancel rate: este mes natural
  const { data: mesRows } = await supabase
    .from("reservas")
    .select("estado_cobro")
    .gte("fecha_in", inicioMes)
    .lte("fecha_in", finMes);
  const totalMes = (mesRows ?? []).length;
  const canceladasMes = (mesRows ?? []).filter((r) => r.estado_cobro === "cancelado").length;
  const cancelRate = totalMes > 0 ? (canceladasMes / totalMes) * 100 : 0;

  // Pace 30/60/90: reservas futuras por ventana
  const { data: paceFuturasAll } = await supabase
    .from("reservas")
    .select("id, importe_total, fecha_in")
    .gte("fecha_in", todayStr)
    .lte("fecha_in", en90d)
    .neq("estado_cobro", "cancelado");
  const pace30 = (paceFuturasAll ?? []).filter(r => (r.fecha_in as string) <= en30d).length;
  const pace60 = (paceFuturasAll ?? []).filter(r => (r.fecha_in as string) <= en60d).length;
  const pace90 = (paceFuturasAll ?? []).length;
  const paceRev90 = (paceFuturasAll ?? []).reduce((s, r) => s + Number(r.importe_total ?? 0), 0);

  // Pace 7d → futuro (bookings creados últimos 7d)
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

  // Heatmap calendar — próximos 90 días con ocupación
  const { data: futureCal } = await supabase
    .from("metricas_dia")
    .select("fecha, occupancy_pct")
    .gte("fecha", todayStr)
    .lte("fecha", en90d)
    .order("fecha", { ascending: true });
  // Mapa fecha → pct
  const calMap = new Map<string, number>();
  (futureCal ?? []).forEach((m) => calMap.set(m.fecha as string, Number(m.occupancy_pct ?? 0)));

  // Recortar el rango del gráfico
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

  // Agregar por semana
  const porSemana = (() => {
    const map = new Map<string, { fecha: string; occupancy_pct: number; adr: number; revpar: number; ingresos_dia: number; habitaciones_ocupadas: number; count: number }>();
    datosChart.forEach((m) => {
      const d = new Date(m.fecha);
      const dia = d.getUTCDay();
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
        description={`KPIs · período seleccionado · Casa Mendilore`}
      />

      {/* Selector lookback */}
      <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border border-border w-fit mb-5">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/metricas?p=${p.key}`}
            className={`px-3 py-1.5 text-xs font-medium rounded transition ${
              selected === p.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Ocupación media" value={formatPercent(occupancyMedia)} hint={hayComparativa ? `${varPct(occupancyMedia, occupancyYA) ?? "—"} vs año anterior` : `Últimos ${lookbackDays} días`} />
        <StatCard label="ADR medio" value={formatCurrency(adrMedio)} hint={hayComparativa ? `${varPct(adrMedio, adrYA) ?? "—"} vs año anterior` : `${totalNoches} noches`} />
        <StatCard label={`Ingresos ${lookbackDays}d`} value={formatCurrency(totalIngresos)} hint={hayComparativa ? `${varPct(totalIngresos, totalIngresosYA) ?? "—"} vs año anterior` : "Suma diaria"} />
        <StatCard label="Noches vendidas" value={String(totalNoches)} hint={hayComparativa ? `${varPct(totalNoches, totalNochesYA) ?? "—"} vs año anterior` : `De ${lookbackDays * 6} disponibles`} />
      </div>

      {!hayComparativa && (
        <div className="text-xs text-muted-foreground italic mb-6 px-1">
          Comparativa año anterior aparecerá cuando haya histórico de 365+ días en BD.
        </div>
      )}

      {/* KPIs operacionales MrPlan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Lead time medio"
          value={leadTimes.length > 0 ? `${leadTimeMedio.toFixed(1)} d` : "—"}
          hint={leadTimes.length > 0 ? `${leadTimes.length} reservas 90d` : "Sin datos"}
        />
        <StatCard
          label="ALOS — estancia media"
          value={alosMedio > 0 ? `${alosMedio.toFixed(1)} noches` : "—"}
          hint={alosMedio > 0 ? `${nochesArr.length} reservas` : "Sin datos"}
        />
        <StatCard
          label="Cancel rate (mes)"
          value={totalMes > 0 ? `${cancelRate.toFixed(1)}%` : "—"}
          hint={totalMes > 0 ? `${canceladasMes} de ${totalMes}` : "Sin reservas"}
        />
        <StatCard
          label="Pace 7 d → futuro"
          value={String(paceCount)}
          hint={paceCount > 0 ? `${formatCurrency(paceRevenue)} pipeline` : "Sin nuevas"}
        />
      </div>

      {/* Booking pace 30/60/90 — pipeline futuro */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-foreground mb-1">Booking pace — pipeline futuro</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Reservas confirmadas con check-in en cada ventana · {formatCurrency(paceRev90)} pipeline total 90d
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Próximos 30 d</div>
            <div className="text-2xl font-semibold text-foreground mt-1">{pace30}</div>
            <div className="text-xs text-muted-foreground mt-0.5">reservas</div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Próximos 60 d</div>
            <div className="text-2xl font-semibold text-foreground mt-1">{pace60}</div>
            <div className="text-xs text-muted-foreground mt-0.5">reservas</div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Próximos 90 d</div>
            <div className="text-2xl font-semibold text-foreground mt-1">{pace90}</div>
            <div className="text-xs text-muted-foreground mt-0.5">reservas</div>
          </div>
        </div>
      </div>

      {/* Channel mix */}
      {channelMix.length > 0 && totalChannelRevenue > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h2 className="text-base font-semibold text-foreground mb-1">Channel mix — últimos 30 días</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Distribución de ingresos por canal · {formatCurrency(totalChannelRevenue)} · {(canalRows ?? []).length} reservas
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

      {/* Heatmap calendario ocupación próximos 90 días */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-foreground mb-1">Heatmap ocupación — próximos 90 días</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Cada celda = 1 día · color verde más intenso = mayor ocupación · gris = sin datos
        </p>
        <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] sm:grid-cols-[repeat(30,minmax(0,1fr))] gap-1">
          {Array.from({ length: 90 }, (_, i) => {
            const d = new Date(today.getTime() + i * 86400_000);
            const ds = d.toISOString().slice(0, 10);
            const pct = calMap.get(ds);
            const intensity = pct === undefined ? 0 : Math.min(100, Math.round(pct));
            const bg = intensity === 0
              ? "bg-muted/40"
              : intensity < 25 ? "bg-emerald-100 dark:bg-emerald-950/40"
              : intensity < 50 ? "bg-emerald-200 dark:bg-emerald-900/50"
              : intensity < 75 ? "bg-emerald-400 dark:bg-emerald-700/70"
              : "bg-emerald-600 dark:bg-emerald-500";
            return (
              <div
                key={i}
                className={`aspect-square rounded-sm ${bg}`}
                title={`${ds} · ${pct !== undefined ? formatPercent(pct) : "sin datos"}`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
          <span>Menos</span>
          <div className="size-3 rounded-sm bg-muted/40"></div>
          <div className="size-3 rounded-sm bg-emerald-100 dark:bg-emerald-950/40"></div>
          <div className="size-3 rounded-sm bg-emerald-200 dark:bg-emerald-900/50"></div>
          <div className="size-3 rounded-sm bg-emerald-400 dark:bg-emerald-700/70"></div>
          <div className="size-3 rounded-sm bg-emerald-600 dark:bg-emerald-500"></div>
          <span>Más</span>
        </div>
      </div>

      {/* Visitas web — Embed Looker Studio */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground mb-1">Visitas web — mendilore.com</h2>
            <p className="text-xs text-muted-foreground">
              Informe Looker Studio · sesiones, usuarios, fuentes y dispositivos · últimos 28 días
            </p>
          </div>
          <a
            href="https://lookerstudio.google.com/reporting/11962e47-595d-43bc-bee9-86a67fad77b3"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-primary hover:underline whitespace-nowrap"
          >
            Abrir en Looker ↗
          </a>
        </div>

        <div className="rounded-lg overflow-hidden border border-border bg-muted/20" style={{ height: "680px" }}>
          <iframe
            title="Visitas web mendilore.com (Looker Studio)"
            src="https://lookerstudio.google.com/embed/reporting/11962e47-595d-43bc-bee9-86a67fad77b3/page/p_70jbm2sotd"
            width="100%"
            height="100%"
            frameBorder="0"
            style={{ border: 0 }}
            allowFullScreen
            sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        </div>

        <p className="text-[11px] text-muted-foreground mt-2 italic">
          Si ves "Acceso denegado", asegúrate de estar logueado en Google con info@mendilore.com o goiko@gugocreative.com en este navegador.
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
