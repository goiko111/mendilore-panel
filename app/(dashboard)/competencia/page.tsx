export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Competencia" };

type Snapshot = {
  competidor_id: string;
  fecha_snapshot: string;
  check_in: string;
  check_out: string;
  precio_total: number | null;
  precio_por_noche: number | null;
  moneda: string;
  disponible: boolean;
  rating: number | null;
  rating_label: string | null;
  reviews_count: number | null;
};

/**
 * Devuelve una etiqueta conceptual para la ventana en lugar de la fecha cruda.
 * Calcula días desde hoy hasta check_in y devuelve un label claro para el operador.
 */
function ventanaLabel(check_in: string): { primary: string; secondary: string } {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(check_in + "T00:00:00Z");
  const diasDesdeHoy = Math.round((target.getTime() - today.getTime()) / 86400_000);

  const monthLabel = target.toLocaleDateString("es-ES", { month: "short", timeZone: "UTC" }).replace(".", "");
  const yearShort = target.getUTCFullYear().toString().slice(-2);
  const dayLabel = target.getUTCDate();

  let primary = `${monthLabel} ${yearShort}`;
  if (diasDesdeHoy <= 0) primary = "Ahora";
  else if (diasDesdeHoy <= 10) primary = "Próxima sem.";
  else if (diasDesdeHoy <= 21) primary = "+2 sem.";
  else if (diasDesdeHoy <= 45) primary = "Próx. mes";
  else if (diasDesdeHoy <= 75) primary = "+2 meses";
  else if (diasDesdeHoy <= 110) primary = `${monthLabel} ${yearShort}`;
  else if (diasDesdeHoy <= 200) primary = `${monthLabel} ${yearShort}`;
  else primary = `${monthLabel} ${yearShort}`;

  const secondary = `entrada ${dayLabel} ${monthLabel}`;
  return { primary, secondary };
}

export default async function CompetenciaPage() {
  let competidores: any[] | null = [];
  let snapshots: any[] | null = [];
  let pageError: string | null = null;
  try {
    const supabase = createAdminClient();
    const { data: c, error: ec } = await supabase
      .from("competidores")
      .select("id, nombre, booking_url, estrellas")
      .eq("activo", true)
      .order("nombre");
    if (ec) throw new Error(`competidores: ${ec.message}`);
    competidores = c;

    const desde60d = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    const { data: s, error: es } = await supabase
      .from("precios_competidores_dia")
      .select("competidor_id, fecha_snapshot, check_in, check_out, precio_total, precio_por_noche, moneda, disponible, rating, rating_label, reviews_count")
      .gte("fecha_snapshot", desde60d)
      .order("check_in", { ascending: true });
    if (es) throw new Error(`precios_competidores_dia: ${es.message}`);
    snapshots = s;
  } catch (err: any) {
    pageError = String(err?.message ?? err);
    competidores = [];
    snapshots = [];
  }

  // Por cada (competidor_id, check_in) → snapshot más reciente
  const ultimosPorVentana = new Map<string, Snapshot>();
  (snapshots ?? []).forEach((s: any) => {
    const key = `${s.competidor_id}|${s.check_in}`;
    const existing = ultimosPorVentana.get(key);
    if (!existing || s.fecha_snapshot > existing.fecha_snapshot) {
      ultimosPorVentana.set(key, s);
    }
  });

  // Ventanas únicas ordenadas por check_in
  const ventanasSet = new Set<string>();
  Array.from(ultimosPorVentana.values()).forEach((s) => ventanasSet.add(s.check_in));
  const ventanas = Array.from(ventanasSet).sort();

  // Ratings por competidor
  const ratingsCompetidor = new Map<string, { rating: number | null; rating_label: string | null; reviews_count: number | null }>();
  (snapshots ?? []).forEach((s: any) => {
    if (!ratingsCompetidor.has(s.competidor_id) && s.rating) {
      ratingsCompetidor.set(s.competidor_id, {
        rating: s.rating,
        rating_label: s.rating_label,
        reviews_count: s.reviews_count
      });
    }
  });

  // Para cada ventana, calcular: precios disponibles, media, mínimo, máximo
  type Estadistico = { media: number; min: number; max: number; nDisponibles: number; nTotal: number; moneda: string };
  const estadisticosPorVentana = new Map<string, Estadistico>();
  ventanas.forEach((check_in) => {
    const precios: number[] = [];
    let moneda = "EUR";
    let nTotal = 0;
    (competidores ?? []).forEach((c: any) => {
      const s = ultimosPorVentana.get(`${c.id}|${check_in}`);
      if (s) {
        nTotal++;
        if (s.disponible && s.precio_por_noche) {
          precios.push(Number(s.precio_por_noche));
          moneda = s.moneda;
        }
      }
    });
    if (precios.length > 0) {
      estadisticosPorVentana.set(check_in, {
        media: precios.reduce((a, b) => a + b, 0) / precios.length,
        min: Math.min(...precios),
        max: Math.max(...precios),
        nDisponibles: precios.length,
        nTotal,
        moneda
      });
    }
  });


  // ===========================
  // Alertas de movimiento: detectar cambios >15% en precios entre snapshots
  // Comparamos el snapshot más reciente vs el penúltimo (mismo competidor + check_in)
  // ===========================
  type Alerta = { competidor: string; check_in: string; precio_actual: number; precio_anterior: number; delta_pct: number; tipo: "subida" | "bajada" };
  const alertasMovimiento: Alerta[] = [];
  const snapshotsPorClave = new Map<string, Snapshot[]>();
  (snapshots ?? []).forEach((s: any) => {
    if (!s.disponible || !s.precio_por_noche) return;
    const k = `${s.competidor_id}|${s.check_in}`;
    const arr = snapshotsPorClave.get(k) ?? [];
    arr.push(s as Snapshot);
    snapshotsPorClave.set(k, arr);
  });
  snapshotsPorClave.forEach((arr, k) => {
    if (arr.length < 2) return;
    arr.sort((a, b) => (a.fecha_snapshot < b.fecha_snapshot ? 1 : -1));
    const actual = arr[0];
    const anterior = arr[1];
    if (!actual.precio_por_noche || !anterior.precio_por_noche) return;
    const pa = Number(actual.precio_por_noche);
    const pn = Number(anterior.precio_por_noche);
    if (pn === 0) return;
    const delta = ((pa - pn) / pn) * 100;
    if (Math.abs(delta) < 15) return;
    const [comp_id, check_in] = k.split("|");
    const compName = (competidores ?? []).find((c: any) => c.id === comp_id)?.nombre ?? "—";
    alertasMovimiento.push({
      competidor: compName,
      check_in,
      precio_actual: pa,
      precio_anterior: pn,
      delta_pct: delta,
      tipo: delta > 0 ? "subida" : "bajada"
    });
  });
  alertasMovimiento.sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct));
  const alertasTop = alertasMovimiento.slice(0, 8);


  // ===========================
  // Tendencias por competidor: serie precio_medio diario últimos 60d
  // Para sparklines en la sección Tendencias
  // ===========================
  type Tendencia = { competidor_id: string; nombre: string; serie: { fecha: string; precio: number }[]; precio_actual: number | null; precio_hace30d: number | null; delta_pct: number | null };
  const tendenciasPorCompetidor: Tendencia[] = [];
  (competidores ?? []).forEach((c: any) => {
    // Recolectar precios diarios (todos los snapshots disponibles del competidor)
    const preciosPorFecha = new Map<string, number[]>();
    (snapshots ?? []).forEach((s: any) => {
      if (s.competidor_id !== c.id || !s.disponible || !s.precio_por_noche) return;
      const fecha = s.fecha_snapshot as string;
      const arr = preciosPorFecha.get(fecha) ?? [];
      arr.push(Number(s.precio_por_noche));
      preciosPorFecha.set(fecha, arr);
    });
    // Promediar por fecha y ordenar
    const serie = Array.from(preciosPorFecha.entries())
      .map(([fecha, ps]) => ({ fecha, precio: ps.reduce((a, b) => a + b, 0) / ps.length }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (serie.length === 0) return;
    const actual = serie[serie.length - 1].precio;
    const hoy = new Date(serie[serie.length - 1].fecha).getTime();
    const hace30d = serie.find(s => new Date(s.fecha).getTime() >= hoy - 30 * 86400_000)?.precio ?? null;
    const delta = hace30d && hace30d > 0 ? ((actual - hace30d) / hace30d) * 100 : null;
    tendenciasPorCompetidor.push({
      competidor_id: c.id,
      nombre: c.nombre,
      serie,
      precio_actual: actual,
      precio_hace30d: hace30d,
      delta_pct: delta
    });
  });

  return (
    <div>
      <PageHeader
        title="Competencia"
        description={`${(competidores ?? []).length} hoteles · ${ventanas.length} ${ventanas.length === 1 ? "ventana" : "ventanas"} temporales · precios por noche (€/n) para estancias de 3 noches · 2 adultos`}
        actions={
          <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            Snapshots scheduled — ver doc
          </span>
        }
      />

      {pageError && (
        <div className="bg-card border border-orange-300 dark:border-orange-800 rounded-xl p-5 mb-5">
          <h2 className="text-base font-semibold text-foreground mb-1">⚠️ Error temporal al cargar datos de competencia</h2>
          <p className="text-xs text-muted-foreground mb-2">El bloque de competencia no pudo cargar — esto puede deberse a una migración pendiente o un problema temporal de conexión. El resto del panel funciona con normalidad.</p>
          <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer">Detalle técnico</summary><code className="block mt-2 p-2 bg-muted/40 rounded">{pageError}</code></details>
        </div>
      )}

      {/* Alertas de movimiento de precios */}
      {alertasTop.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-5">
          <h2 className="text-base font-semibold text-foreground mb-1">📊 Alertas de movimiento</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Cambios ≥15% en precios entre los últimos 2 snapshots ({alertasMovimiento.length} totales, mostrando top {alertasTop.length})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alertasTop.map((a, i) => {
              const sign = a.delta_pct > 0 ? "+" : "";
              const bg = a.tipo === "bajada" ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800" : "bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800";
              const colorTexto = a.tipo === "bajada" ? "text-emerald-700 dark:text-emerald-400" : "text-orange-700 dark:text-orange-400";
              return (
                <div key={i} className={`rounded-lg border p-3 ${bg}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-medium text-foreground text-sm truncate">{a.competidor}</div>
                    <div className={`text-sm font-semibold tabular-nums ${colorTexto}`}>{sign}{a.delta_pct.toFixed(1)}%</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Entrada {ventanaLabel(a.check_in).secondary} · {formatCurrency(a.precio_anterior, "EUR")} → <strong className="text-foreground">{formatCurrency(a.precio_actual, "EUR")}</strong>/n
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 italic">
            Bajadas grandes → competidor presiona por reservar; subidas → competidor sube tras llenarse o estrategia agresiva.
          </p>
        </div>
      )}



      {/* Tendencias por competidor — adaptativo según nº snapshots */}
      {tendenciasPorCompetidor.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-foreground">📈 Tendencias por competidor</h2>
            <span className="text-[11px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
              {tendenciasPorCompetidor.reduce((s, t) => s + t.serie.length, 0)} snapshots totales
            </span>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Evolución del precio medio por noche · sparkline cuando hay 3+ snapshots · delta 30d cuando hay histórico
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tendenciasPorCompetidor.map((t) => {
              const nSnaps = t.serie.length;
              const hayTendencia = nSnaps >= 3;
              const hayDelta = t.delta_pct !== null && Math.abs(t.delta_pct) > 0.1;

              if (!hayTendencia) {
                // Vista compacta cuando hay pocos snapshots
                return (
                  <div key={t.competidor_id} className="rounded-lg border border-border p-3 bg-muted/10">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-medium text-foreground text-sm truncate flex-1">{t.nombre}</div>
                      {t.precio_actual !== null && (
                        <div className="font-semibold text-foreground text-sm">{formatCurrency(t.precio_actual, "EUR")}/n</div>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded text-center border border-amber-200/60 dark:border-amber-800/40">
                      📡 {nSnaps} snapshot{nSnaps !== 1 ? "s" : ""} · esperando más datos para tendencia
                    </div>
                  </div>
                );
              }

              // Sparkline con datos reales
              const min = Math.min(...t.serie.map(s => s.precio));
              const max = Math.max(...t.serie.map(s => s.precio));
              const rango = max - min || 1;
              const W = 200;
              const H = 40;
              const puntos = t.serie.map((s, i) => {
                const x = (i / Math.max(1, t.serie.length - 1)) * W;
                const y = H - ((s.precio - min) / rango) * H;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              }).join(" ");
              const colorLinea = t.delta_pct === null ? "#6b7280" : t.delta_pct > 5 ? "#ea580c" : t.delta_pct < -5 ? "#059669" : "#6b7280";
              const sign = t.delta_pct && t.delta_pct > 0 ? "+" : "";
              return (
                <div key={t.competidor_id} className="rounded-lg border border-border p-3 bg-muted/10">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-medium text-foreground text-sm truncate flex-1">{t.nombre}</div>
                    <div className="text-xs text-right shrink-0">
                      {t.precio_actual !== null && (
                        <div className="font-semibold text-foreground">{formatCurrency(t.precio_actual, "EUR")}/n</div>
                      )}
                      {hayDelta && (
                        <div className={t.delta_pct! > 5 ? "text-orange-700 dark:text-orange-400 font-medium" : t.delta_pct! < -5 ? "text-emerald-700 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
                          {sign}{t.delta_pct!.toFixed(1)}% vs 30d
                        </div>
                      )}
                    </div>
                  </div>
                  <svg width="100%" height="40" viewBox="0 0 200 40" preserveAspectRatio="none" className="overflow-visible">
                    <polyline points={puntos} fill="none" stroke={colorLinea} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {t.serie.slice(-1).map((p, i) => {
                      const x = W;
                      const y = H - ((p.precio - min) / rango) * H;
                      return <circle key={i} cx={x} cy={y} r="2.5" fill={colorLinea} />;
                    })}
                  </svg>
                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-between">
                    <span>min {formatCurrency(min, "EUR")}</span>
                    <span>{nSnaps} snapshots</span>
                    <span>max {formatCurrency(max, "EUR")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!competidores || competidores.length === 0 ? (
        <EmptyState
          title="Sin competidores cargados"
          description="Ejecuta la migración supabase/migrations/0003_seed.sql para insertar los 6 competidores."
          icon={<TrendingUp className="size-5" />}
        />
      ) : ventanas.length === 0 ? (
        <EmptyState
          title="Sin snapshots de precios"
          description="El primer run del scraper de Apify aún no ha completado o no devolvió datos."
          icon={<TrendingUp className="size-5" />}
        />
      ) : (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3 sticky left-0 bg-muted/50 z-10 min-w-[220px]">Hotel</th>
                  {ventanas.map((check_in) => {
                    const lab = ventanaLabel(check_in);
                    return (
                      <th key={check_in} className="text-right font-medium px-4 py-3 min-w-[120px]">
                        <div className="text-foreground capitalize">{lab.primary}</div>
                        <div className="text-[10px] text-muted-foreground font-normal mt-0.5 capitalize">{lab.secondary}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {competidores.map((c: any) => {
                  const r = ratingsCompetidor.get(c.id);
                  return (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 sticky left-0 bg-card z-10">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{c.nombre}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {c.estrellas ? "★".repeat(c.estrellas) : ""} {r?.rating ? `· ${r.rating} ${r.rating_label ?? ""}` : ""}
                              {r?.reviews_count ? ` · ${r.reviews_count} reviews` : ""}
                            </div>
                          </div>
                          <Link href={c.booking_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                            <ExternalLink className="size-4" />
                          </Link>
                        </div>
                      </td>
                      {ventanas.map((check_in) => {
                        const s = ultimosPorVentana.get(`${c.id}|${check_in}`);
                        const est = estadisticosPorVentana.get(check_in);
                        if (!s) {
                          return (
                            <td key={check_in} className="px-4 py-3 text-right text-muted-foreground italic text-xs">
                              —
                            </td>
                          );
                        }
                        if (!s.disponible || !s.precio_por_noche) {
                          return (
                            <td key={check_in} className="px-4 py-3 text-right">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                                Sold out
                              </span>
                            </td>
                          );
                        }
                        const precio = Number(s.precio_por_noche);
                        let colorClass = "text-foreground";
                        let icon: React.ReactNode = null;
                        if (est && est.nDisponibles >= 2) {
                          const desviacion = ((precio - est.media) / est.media) * 100;
                          if (desviacion <= -10) {
                            colorClass = "text-emerald-700 dark:text-emerald-400";
                            icon = <TrendingDown className="size-3" />;
                          } else if (desviacion >= 10) {
                            colorClass = "text-orange-700 dark:text-orange-400";
                            icon = <TrendingUp className="size-3" />;
                          } else {
                            colorClass = "text-foreground";
                            icon = <Minus className="size-3 text-muted-foreground" />;
                          }
                        }
                        return (
                          <td key={check_in} className="px-4 py-3 text-right">
                            <div className={`font-semibold inline-flex items-center gap-1 ${colorClass}`} title={`${formatCurrency(s.precio_total ?? 0, s.moneda)} total de 3 noches`}>
                              {icon}
                              {formatCurrency(precio, s.moneda)}/n
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Fila Media de mercado */}
                <tr className="bg-muted/30 font-medium">
                  <td className="px-4 py-3 sticky left-0 bg-muted/30 z-10">
                    <div className="text-sm text-foreground">Media mercado</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Solo competidores con disponibilidad</div>
                  </td>
                  {ventanas.map((check_in) => {
                    const est = estadisticosPorVentana.get(check_in);
                    if (!est || est.nDisponibles === 0) {
                      return <td key={check_in} className="px-4 py-3 text-right text-muted-foreground italic text-xs">—</td>;
                    }
                    return (
                      <td key={check_in} className="px-4 py-3 text-right">
                        <div className="text-foreground font-semibold">{formatCurrency(est.media, est.moneda)}/n</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatCurrency(est.min, est.moneda)}–{formatCurrency(est.max, est.moneda)} · {est.nDisponibles}/{est.nTotal} libres
                        </div>
                      </td>
                    );
                  })}
                </tr>

                {/* Fila 🎯 Sugerencia Casa Mendilore (heurística Nivel 1) */}
                <tr className="bg-primary/5 font-medium border-t-2 border-primary/20">
                  <td className="px-4 py-3 sticky left-0 bg-primary/5 z-10">
                    <div className="text-sm text-foreground flex items-center gap-1.5">🎯 Sugerencia Casa Mendilore</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Basado en señales de mercado · solo orientativa</div>
                  </td>
                  {ventanas.map((check_in) => {
                    const est = estadisticosPorVentana.get(check_in);
                    if (!est) {
                      return <td key={check_in} className="px-4 py-3 text-right text-muted-foreground italic text-xs">—</td>;
                    }
                    const pctSoldOut = est.nTotal > 0 ? 1 - est.nDisponibles / est.nTotal : 0;
                    let factor = 1.0;
                    let label = "Neutro";
                    let colorClass = "text-muted-foreground";
                    let bgClass = "bg-muted/40";
                    if (est.nDisponibles === 0) {
                      factor = 1.15;
                      label = "Mercado lleno";
                      colorClass = "text-emerald-700 dark:text-emerald-400";
                      bgClass = "bg-emerald-50 dark:bg-emerald-950/30";
                    } else if (pctSoldOut >= 0.66) {
                      factor = 1.10;
                      label = "Mercado caliente";
                      colorClass = "text-emerald-700 dark:text-emerald-400";
                      bgClass = "bg-emerald-50 dark:bg-emerald-950/30";
                    } else if (pctSoldOut >= 0.40) {
                      factor = 1.05;
                      label = "Demanda firme";
                      colorClass = "text-emerald-600 dark:text-emerald-500";
                      bgClass = "bg-emerald-50/60 dark:bg-emerald-950/20";
                    } else if (pctSoldOut <= 0.15) {
                      factor = 0.95;
                      label = "Tranquilo";
                      colorClass = "text-orange-700 dark:text-orange-400";
                      bgClass = "bg-orange-50 dark:bg-orange-950/30";
                    } else {
                      factor = 1.0;
                      label = "En línea";
                      colorClass = "text-foreground";
                    }
                    const sugerido = est.media * factor;
                    const deltaPct = (factor - 1) * 100;
                    const signo = deltaPct > 0 ? "+" : "";
                    return (
                      <td key={check_in} className={`px-4 py-3 text-right ${bgClass}`}>
                        <div className={`font-semibold ${colorClass}`}>{formatCurrency(sugerido, est.moneda)}/n</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {label} · {signo}{deltaPct.toFixed(0)}% vs media
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 text-xs text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">Cómo leer esta tabla:</strong> cada celda muestra el precio por noche del competidor para una estancia de 3 noches con 2 adultos. El color indica posición vs media de mercado: <span className="text-emerald-700 dark:text-emerald-400 font-medium">verde</span> = al menos 10% por debajo · <span className="text-foreground font-medium">neutro</span> = en línea (±10%) · <span className="text-orange-700 dark:text-orange-400 font-medium">naranja</span> = al menos 10% por encima.
            </p>
            <p>
              <strong>"Sold out"</strong> = el competidor no tiene disponibilidad en esa fecha. <strong>"—"</strong> = aún no escaneado para esa ventana. El scraper Apify se ejecuta automáticamente cada lunes a las 07:00 (Europe/Madrid) cubriendo 8 ventanas temporales (semana próxima, +2 semanas, +1 mes, +2 meses, +3 meses, +4 meses, semestre, año siguiente). Las fechas exactas son orientativas — el objetivo es comparar tu precio con la curva de mercado en cada período.
            </p>
            <p>
              <strong className="text-foreground">🎯 Sugerencia Casa Mendilore:</strong> heurística sencilla basada en ocupación de competidores en esa ventana.
              <strong>Mercado lleno</strong> (0 disponibles) → +15% sobre media. <strong>Caliente</strong> (≥66% sold out) → +10%.
              <strong>Demanda firme</strong> (≥40% sold out) → +5%. <strong>En línea</strong> (mercado neutral) → media exacta.
              <strong>Tranquilo</strong> (≤15% sold out) → −5% para captar reservas. Es solo orientativa: la decisión final la tomas tú en MisterPlan.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
