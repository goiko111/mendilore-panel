export const runtime = 'edge';

import Link from "next/link";
import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchGA4Snapshot } from "@/lib/ga4-oauth";
import { LineChart as LineChartIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatCard } from "@/components/page-header";
import { formatCurrency, formatPercent, formatDate } from "@/lib/utils";
import { MetricasChart } from "./chart";
import { KPITooltip } from "@/components/kpi-tooltip";

export const metadata = { title: "Métricas" };

type Period = "7d" | "30d" | "90d" | "365d";
const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: "7d", label: "7 días", days: 7 },
  { key: "30d", label: "30 días", days: 30 },
  { key: "90d", label: "90 días", days: 90 },
  { key: "365d", label: "1 año", days: 365 }
];

// Atajos de fechas calculados dinámicamente respecto al "hoy" actual.
// Si la temporada ya pasó este año se salta al año siguiente automáticamente.
function calcularAtajos(today: Date): { key: string; label: string; desde: string; hasta: string }[] {
  const año = today.getFullYear();
  const fmt = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  // Verano: 1 jul - 31 ago del año actual (o siguiente si ya pasó)
  let veranoY = año;
  const veranoFinDate = new Date(Date.UTC(año, 7, 31));
  if (today > veranoFinDate) veranoY = año + 1;
  // Navidad: 22 dic - 6 ene
  let navY = año;
  if (today > new Date(Date.UTC(año + 1, 0, 6))) navY = año + 1;
  // Semana Santa aproximada: 1ª quincena de abril del próximo año si ya pasó
  // (no calculo Gregoriana exacta — uso rango ámbar 20 mar - 12 abr).
  let ssY = año;
  if (today > new Date(Date.UTC(año, 3, 12))) ssY = año + 1;
  // Puente Constitución: 4-8 dic
  let constY = año;
  if (today > new Date(Date.UTC(año, 11, 8))) constY = año + 1;

  // Mes y año actual
  const m = today.getMonth(); // 0-indexed
  const ultimoDiaMes = new Date(Date.UTC(año, m + 1, 0)).getUTCDate();

  return [
    { key: "mes", label: "Mes actual", desde: fmt(año, m + 1, 1), hasta: fmt(año, m + 1, ultimoDiaMes) },
    { key: "anio", label: "Año actual", desde: fmt(año, 1, 1), hasta: fmt(año, 12, 31) },
    { key: "verano", label: `Verano ${veranoY}`, desde: fmt(veranoY, 7, 1), hasta: fmt(veranoY, 8, 31) },
    { key: "navidad", label: `Navidad ${navY}`, desde: fmt(navY, 12, 22), hasta: fmt(navY + 1, 1, 6) },
    { key: "ss", label: `Sem. Santa ${ssY}`, desde: fmt(ssY, 3, 20), hasta: fmt(ssY, 4, 12) },
    { key: "const", label: `Puente ${constY}`, desde: fmt(constY, 12, 4), hasta: fmt(constY, 12, 8) }
  ];
}

export default async function MetricasPage({ searchParams }: { searchParams: Promise<{ p?: string; desde?: string; hasta?: string; atajo?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Date();
  const ATAJOS = calcularAtajos(today);

  // Tres modos: (a) ?desde=YYYY-MM-DD&hasta=... — rango libre
  //             (b) ?atajo=verano|mes|anio|... — un atajo precomputado
  //             (c) ?p=7d|30d|90d|365d — lookback clásico (default)
  let desde: string, hasta: string, lookbackDays: number;
  let selected: Period | null = null;
  let atajoActivo: string | null = null;

  if (sp.desde && sp.hasta && /^\d{4}-\d{2}-\d{2}$/.test(sp.desde) && /^\d{4}-\d{2}-\d{2}$/.test(sp.hasta)) {
    desde = sp.desde;
    hasta = sp.hasta;
    lookbackDays = Math.max(1, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400_000));
  } else if (sp.atajo) {
    const a = ATAJOS.find(x => x.key === sp.atajo);
    if (a) {
      desde = a.desde;
      hasta = a.hasta;
      atajoActivo = a.key;
      lookbackDays = Math.max(1, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 86400_000));
    } else {
      selected = "30d";
      lookbackDays = 30;
      desde = new Date(today.getTime() - lookbackDays * 86400_000).toISOString().slice(0, 10);
      hasta = today.toISOString().slice(0, 10);
    }
  } else {
    selected = (PERIODS.find(p => p.key === sp.p)?.key ?? "30d") as Period;
    lookbackDays = PERIODS.find(p => p.key === selected)!.days;
    desde = new Date(today.getTime() - lookbackDays * 86400_000).toISOString().slice(0, 10);
    hasta = today.toISOString().slice(0, 10);
  }
  const todayStr = today.toISOString().slice(0, 10);
  // Rango extendido para el gráfico: 60d atrás → 90d adelante (cubre histórico + pipeline)
  const desdeChart = new Date(today.getTime() - 60 * 86400_000).toISOString().slice(0, 10);
  const hastaChart = new Date(today.getTime() + 90 * 86400_000).toISOString().slice(0, 10);

  // KPIs últimos N días (sin futuro)
  const { data: metricasPeriodo } = await supabase
    .from("metricas_dia")
    .select("fecha, occupancy_pct, adr, revpar, ingresos_dia, habitaciones_ocupadas")
    .gte("fecha", desde)
    .lte("fecha", hasta)
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

      {/* Selector lookback + atajos */}
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border border-border w-fit">
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
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider mr-1">Atajos:</span>
          {ATAJOS.map((a) => (
            <Link
              key={a.key}
              href={`/metricas?atajo=${a.key}`}
              className={`px-2.5 py-1 text-[11px] font-medium rounded border transition ${
                atajoActivo === a.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
              }`}
              title={`${a.desde} → ${a.hasta}`}
            >
              {a.label}
            </Link>
          ))}
        </div>
        {(atajoActivo || (sp.desde && sp.hasta)) && (
          <div className="text-[11px] text-muted-foreground self-center">
            Rango: <strong className="text-foreground">{desde}</strong> → <strong className="text-foreground">{hasta}</strong> ({lookbackDays} días)
          </div>
        )}
      </div>

      {/* Nav de secciones — Bloque 8 */}
      <nav className="flex flex-wrap items-center gap-2 mb-6 pb-3 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-30 pt-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Ir a:</span>
        <a href="#operativa" className="text-xs font-medium px-2.5 py-1 rounded border border-border bg-card hover:bg-muted text-foreground transition">1. Operativa</a>
        <a href="#yoy" className="text-xs font-medium px-2.5 py-1 rounded border border-border bg-card hover:bg-muted text-foreground transition">2. Año anterior (YoY)</a>
        <a href="#canales" className="text-xs font-medium px-2.5 py-1 rounded border border-border bg-card hover:bg-muted text-foreground transition">3. Canales</a>
        <a href="#resto" className="text-xs font-medium px-2.5 py-1 rounded border border-border bg-card hover:bg-muted text-foreground transition">4. Resto</a>
      </nav>

      {/* ============ 1. SECCION OPERATIVA ============ */}
      <section id="operativa" className="scroll-mt-20 mb-8">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">1</span>
          Operativa
          <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">— Ocupacion, ADR, ingresos y noches vendidas del periodo seleccionado</span>
        </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Ocupación media" value={formatPercent(occupancyMedia)} hint={hayComparativa ? `${varPct(occupancyMedia, occupancyYA) ?? "—"} vs año anterior` : `Últimos ${lookbackDays} días`} tooltip={{ mide: "Porcentaje medio de habitaciones ocupadas en el periodo seleccionado.", calculo: "(noches reservadas ÷ noches disponibles totales) × 100", origen: "MisterPlan", sistemas: "MrPlan → robot → BD del panel" }} />
        <StatCard label="ADR medio" value={formatCurrency(adrMedio)} hint={hayComparativa ? `${varPct(adrMedio, adrYA) ?? "—"} vs año anterior` : `${totalNoches} noches`} tooltip={{ mide: "ADR (Average Daily Rate) — precio medio por habitación vendida en el periodo.", calculo: "ingresos totales del periodo ÷ noches vendidas", origen: "MisterPlan", sistemas: "MrPlan → robot → BD del panel" }} />
        <StatCard label={`Ingresos ${lookbackDays}d`} value={formatCurrency(totalIngresos)} hint={hayComparativa ? `${varPct(totalIngresos, totalIngresosYA) ?? "—"} vs año anterior` : "Suma diaria"} tooltip={{ mide: "Suma de los ingresos generados por reservas con check-in en el periodo.", calculo: "SUM(importe_total) WHERE fecha_in ∈ [periodo]", origen: "MisterPlan", sistemas: "MrPlan → robot → BD del panel" }} />
        <StatCard label="Noches vendidas" value={String(totalNoches)} hint={hayComparativa ? `${varPct(totalNoches, totalNochesYA) ?? "—"} vs año anterior` : `De ${lookbackDays * 6} disponibles`} tooltip={{ mide: "Suma total de noches reservadas en el periodo.", calculo: "SUM(noches) sobre reservas confirmadas del periodo", origen: "MisterPlan", sistemas: "MrPlan → robot → BD del panel" }} />
      </div>

      {!hayComparativa && (
        <div className="text-xs text-muted-foreground italic mb-6 px-1">
          Comparativa año anterior aparecerá cuando haya histórico de 365+ días en BD.
        </div>
      )}

      {/* KPIs operacionales MrPlan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Antelación media de reserva"
          value={leadTimes.length > 0 ? `${leadTimeMedio.toFixed(1)} d` : "—"}
          hint={leadTimes.length > 0 ? `${leadTimes.length} reservas 90d` : "Esperando más reservas"}
          tooltip={{
            mide: "Cuánto tiempo antes del check-in se hacen las reservas, de media. Indica cuánta visibilidad de futuro tenéis.",
            calculo: "Por cada reserva confirmada con check-in en los próximos 90 días: días entre la fecha de creación y fecha_in. Se promedia el resultado.",
            origen: "MisterPlan — cada reserva trae su timestamp de creación y su check-in.",
            sistemas: "MrPlan → robot → BD del panel. Cuanto más alto el número, más planificado el negocio.",
          }}
        />
        <StatCard
          label="Estancia media (ALOS)"
          value={alosMedio > 0 ? `${alosMedio.toFixed(1)} noches` : "—"}
          hint={alosMedio > 0 ? `${nochesArr.length} reservas` : "Esperando más reservas"}
          tooltip={{
            mide: "ALOS (Average Length of Stay) — cuántas noches dura cada estancia, de media. Importante porque a más noches, menos rotación de limpieza y mejor margen operativo.",
            calculo: "SUM(noches) ÷ COUNT(reservas) sobre reservas no canceladas del periodo.",
            origen: "MisterPlan — cada reserva trae sus noches calculadas (fecha_out - fecha_in).",
            sistemas: "MrPlan → robot → BD del panel.",
          }}
        />
        <StatCard
          label="Cancel rate (mes)"
          value={totalMes > 0 ? `${cancelRate.toFixed(1)}%` : "—"}
          hint={totalMes > 0 ? `${canceladasMes} de ${totalMes}` : "Sin reservas"}
          tooltip={{
            mide: "Porcentaje de reservas del mes en curso que han acabado canceladas o como no-show.",
            calculo: "(reservas canceladas + no_show del mes) ÷ (total reservas del mes) × 100",
            origen: "MisterPlan — el estado de la reserva refleja la cancelación.",
            sistemas: "MrPlan → robot → BD del panel. Si sube respecto al histórico, suele ser señal de problema con un canal o política.",
          }}
        />
        <StatCard
          label="Ritmo de reservas (últimos 7d)"
          value={String(paceCount)}
          hint={paceCount > 0 ? `${formatCurrency(paceRevenue)} en cartera` : "Sin nuevas reservas"}
          tooltip={{
            mide: "Cuántas reservas nuevas han entrado en los últimos 7 días (creadas, no llegadas).",
            calculo: "COUNT(reservas) WHERE created_at >= hace 7 días. La cartera es la SUMA del importe_total de esas reservas.",
            origen: "MisterPlan — created_at de cada reserva.",
            sistemas: "MrPlan → robot → BD del panel. Útil para ver si esta semana está entrando más o menos volumen que la anterior.",
          }}
        />
      </div>

      </section>

      {/* ============ 2. SECCION YoY ============ */}
      <section id="yoy" className="scroll-mt-20 mb-8">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">2</span>
          Ano anterior (YoY)
          <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">— Comparativa vs mismo periodo del ano anterior</span>
        </h2>
        {hayComparativa ? (
          <div className="bg-card border border-border rounded-xl p-5 mb-6">
            <p className="text-xs text-muted-foreground mb-3">
              Las variaciones YoY aparecen como hints debajo de cada KPI principal en la seccion Operativa. Para tener cobertura completa de YoY hace falta haber cargado al menos 12 meses de historico desde MisterPlan.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ocupacion</div>
                <div className="text-sm font-semibold text-foreground mt-1">{varPct(occupancyMedia, occupancyYA) ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">{formatPercent(occupancyYA)} hace 1 ano</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">ADR</div>
                <div className="text-sm font-semibold text-foreground mt-1">{varPct(adrMedio, adrYA) ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">{formatCurrency(adrYA)} hace 1 ano</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ingresos</div>
                <div className="text-sm font-semibold text-foreground mt-1">{varPct(totalIngresos, totalIngresosYA) ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">{formatCurrency(totalIngresosYA)} hace 1 ano</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Noches</div>
                <div className="text-sm font-semibold text-foreground mt-1">{varPct(totalNoches, totalNochesYA) ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">{totalNochesYA} hace 1 ano</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <div className="text-amber-700 dark:text-amber-400 text-lg leading-none">📊</div>
              <div className="text-xs">
                <div className="text-sm font-semibold text-foreground mb-1">Comparativa YoY no disponible aun</div>
                <p className="text-muted-foreground leading-relaxed">
                  Para mostrar comparativa con el mismo periodo del ano anterior necesitamos haber cargado los datos de MisterPlan de hace 1 ano. Actualmente solo hay datos de las ultimas semanas.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-2">
                  <strong>Proximo paso:</strong> cargar historico de MisterPlan de los ultimos 12 meses (planificado para proxima sesion, ~2 h).
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ============ 3. SECCION CANALES ============ */}
      <section id="canales" className="scroll-mt-20 mb-8">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">3</span>
          Canales
          <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">— Reparto de ingresos por canal de venta + pipeline futuro</span>
        </h2>

      {/* Booking pace 30/60/90 — pipeline futuro */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-foreground mb-1">Ritmo de reservas futuras</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Reservas confirmadas con entrada en cada ventana · {formatCurrency(paceRev90)} pipeline total 90d
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center">Próximos 30 d<KPITooltip mide="Reservas confirmadas con check-in en los próximos 30 días." calculo="COUNT(reservas) WHERE fecha_in BETWEEN hoy Y hoy+30d AND estado_reserva != cancelada" origen="MisterPlan" sistemas="MrPlan → robot → BD del panel · pipeline cercano" /></div>
            <div className="text-2xl font-semibold text-foreground mt-1">{pace30}</div>
            <div className="text-xs text-muted-foreground mt-0.5">reservas</div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center">Próximos 60 d<KPITooltip mide="Reservas confirmadas con check-in en los próximos 60 días." calculo="COUNT(reservas) WHERE fecha_in BETWEEN hoy Y hoy+60d AND estado_reserva != cancelada" origen="MisterPlan" sistemas="MrPlan → robot → BD del panel · pipeline a 2 meses vista" /></div>
            <div className="text-2xl font-semibold text-foreground mt-1">{pace60}</div>
            <div className="text-xs text-muted-foreground mt-0.5">reservas</div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center">Próximos 90 d<KPITooltip mide="Reservas confirmadas con check-in en los próximos 90 días." calculo="COUNT(reservas) WHERE fecha_in BETWEEN hoy Y hoy+90d AND estado_reserva != cancelada" origen="MisterPlan" sistemas="MrPlan → robot → BD del panel · pipeline trimestral total" /></div>
            <div className="text-2xl font-semibold text-foreground mt-1">{pace90}</div>
            <div className="text-xs text-muted-foreground mt-0.5">reservas</div>
          </div>
        </div>
      </div>

      {/* Channel mix */}
      {channelMix.length > 0 && totalChannelRevenue > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <h2 className="text-base font-semibold text-foreground mb-1 flex items-center">Reparto por canal — últimos 30 días<KPITooltip mide="Distribución de los ingresos por canal de venta (Booking, web propia, teléfono, walk-in, etc.) en los últimos 30 días." calculo="SUM(importe_total) agrupado por canal sobre reservas con check-in en últimos 30d, excluyendo canceladas." origen="MisterPlan — el campo canal de cada reserva" sistemas="MrPlan → robot → BD del panel · indica de dónde viene el dinero" /></h2>
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

      </section>

      {/* ============ 4. SECCION RESTO ============ */}
      <section id="resto" className="scroll-mt-20 mb-8">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">4</span>
          Resto
          <span className="text-[10px] font-normal text-muted-foreground normal-case tracking-normal">— Mapa de calor de ocupacion, visitas web (GA4) y grafico de evolucion</span>
        </h2>

      {/* Heatmap calendario ocupación próximos 90 días */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-base font-semibold text-foreground mb-1">Mapa de calor — ocupación próximos 90 días</h2>
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
      {/* Visitas web GA4 — server-side con OAuth user-delegated */}
      <Suspense fallback={<div className="bg-card border border-border rounded-xl p-5 mb-6 text-sm text-muted-foreground">Cargando GA4...</div>}>
        <VisitasWebGA4 />
      </Suspense>


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
      </section>
    </div>
  );
}


async function VisitasWebGA4() {
  const supabase = createAdminClient();
  let data = null;
  let error = null;
  try {
    data = await fetchGA4Snapshot(supabase);
  } catch (e: any) {
    error = e?.message || "Error desconocido";
  }

  if (!data) {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="size-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">📊</div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground mb-1">Visitas web — mendilore.com</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Conecta tu cuenta Google con acceso a GA4 mendilore.com para ver sesiones, usuarios, top páginas y fuentes inline aquí.
            </p>
            <a href="/api/oauth/google/start" className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-medium px-4 py-2.5 rounded-lg transition shadow-sm">
              🔗 Conectar Google Analytics
            </a>
            {error && <p className="text-xs text-red-700 dark:text-red-400 mt-3">⚠️ {error.slice(0, 200)}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">Visitas web — mendilore.com</h2>
          <p className="text-xs text-muted-foreground">Datos GA4 en directo · últimos 28 días</p>
        </div>
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full font-medium">🟢 Conectado</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center">Sesiones<KPITooltip mide="Número de sesiones (visitas) a mendilore.com en los últimos 28 días." calculo="Google Analytics 4 — sessions metric, dimensión por fecha" origen="GA4 — propiedad de mendilore.com, autenticación OAuth con tu cuenta de Google" sistemas="GA4 Data API → OAuth user-delegated → panel server-side" /></div>
          <div className="text-2xl font-semibold text-foreground mt-1">{data.sesiones.toLocaleString("es-ES")}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center">Usuarios<KPITooltip mide="Usuarios únicos que han entrado en mendilore.com en los últimos 28 días." calculo="GA4 — totalUsers metric" origen="GA4 (mendilore.com)" sistemas="GA4 Data API server-side. Cookies necesarias para identificar al mismo usuario en varias visitas." /></div>
          <div className="text-2xl font-semibold text-foreground mt-1">{data.usuarios.toLocaleString("es-ES")}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center">Páginas vistas<KPITooltip mide="Páginas vistas totales en mendilore.com en los últimos 28 días." calculo="GA4 — screenPageViews metric" origen="GA4 (mendilore.com)" sistemas="GA4 Data API server-side · útil para ver si crece el interés en una página concreta" /></div>
          <div className="text-2xl font-semibold text-foreground mt-1">{data.pageviews.toLocaleString("es-ES")}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center">Duración media<KPITooltip mide="Tiempo medio que dura una sesión en mendilore.com (segundos)." calculo="GA4 — averageSessionDuration metric" origen="GA4 (mendilore.com)" sistemas="GA4 Data API server-side · más tiempo = más interés / mejor contenido" /></div>
          <div className="text-2xl font-semibold text-foreground mt-1">{Math.round(data.duracionMedia)}s</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <div className="text-xs font-semibold text-foreground mb-2">Top páginas</div>
          <ul className="space-y-1.5">
            {data.topPaginas.length === 0 ? (<li className="text-xs text-muted-foreground italic">Sin datos</li>) :
              data.topPaginas.map((p) => (
                <li key={p.ruta} className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground">{p.ruta || "/"}</span>
                  <span className="shrink-0 ml-3 tabular-nums text-muted-foreground">{p.views}</span>
                </li>
              ))
            }
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold text-foreground mb-2">Fuentes de tráfico</div>
          <ul className="space-y-1.5">
            {data.topFuentes.length === 0 ? (<li className="text-xs text-muted-foreground italic">Sin datos</li>) :
              data.topFuentes.map((f) => (
                <li key={f.fuente} className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground capitalize">{f.fuente || "(direct)"}</span>
                  <span className="shrink-0 ml-3 tabular-nums text-muted-foreground">{f.sesiones}</span>
                </li>
              ))
            }
          </ul>
        </div>
      </div>
    </div>
  );
}
