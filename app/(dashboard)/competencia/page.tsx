export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatCurrency } from "@/lib/utils";

export const metadata = { title: "Competencia" };

type Snapshot = {
  competidor_id: string;
  fecha_snapshot: string;
  check_in: string;
  check_out: string;
  precio_total: number | null;
  precio_por_noche: number | null;
  moneda: string | null;
  disponible: boolean;
  rating: number | null;
  rating_label: string | null;
  reviews_count: number | null;
};

function ventanaLabel(check_in: string): { primary: string; secondary: string } {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const target = new Date(check_in + "T00:00:00Z");
    if (isNaN(target.getTime())) return { primary: check_in, secondary: "" };
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
    return { primary, secondary: `entrada ${dayLabel} ${monthLabel}` };
  } catch {
    return { primary: check_in, secondary: "" };
  }
}

export default async function CompetenciaPage() {
  let competidores: any[] = [];
  let snapshots: any[] = [];
  let pageError: string | null = null;
  try {
    const supabase = createAdminClient();
    // Defensivo: si migration 0019 (es_propia) no se ha aplicado, retry sin esa columna
    let c: any[] | null = null;
    let ec: any = null;
    {
      const r = await supabase
        .from("competidores")
        .select("id, nombre, booking_url, estrellas, es_propia")
        .eq("activo", true)
        .order("es_propia", { ascending: false })
        .order("nombre");
      c = r.data; ec = r.error;
    }
    if (ec) {
      // Fallback sin es_propia
      const r2 = await supabase
        .from("competidores")
        .select("id, nombre, booking_url, estrellas")
        .eq("activo", true)
        .order("nombre");
      c = (r2.data ?? []).map((x: any) => ({ ...x, es_propia: false }));
      ec = r2.error;
    }
    if (ec) throw new Error(`competidores: ${ec.message}`);
    competidores = c ?? [];

    const desde60d = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    const { data: s, error: es } = await supabase
      .from("precios_competidores_dia")
      .select("competidor_id, fecha_snapshot, check_in, check_out, precio_total, precio_por_noche, moneda, disponible, rating, rating_label, reviews_count")
      .gte("fecha_snapshot", desde60d)
      .order("check_in", { ascending: true });
    if (es) throw new Error(`precios_competidores_dia: ${es.message}`);
    snapshots = s ?? [];
  } catch (err: any) {
    pageError = String(err?.message ?? err);
  }

  // Build matriz: por competidor x ventana, snapshot más reciente
  const ultimosPorVentana = new Map<string, Snapshot>();
  snapshots.forEach((s: any) => {
    if (!s?.check_in || !s?.competidor_id) return;
    const key = `${s.competidor_id}|${s.check_in}`;
    const existing = ultimosPorVentana.get(key);
    if (!existing || (s.fecha_snapshot ?? "") > (existing.fecha_snapshot ?? "")) {
      ultimosPorVentana.set(key, s as Snapshot);
    }
  });

  const ventanasSet = new Set<string>();
  Array.from(ultimosPorVentana.values()).forEach((s) => {
    if (s.check_in) ventanasSet.add(s.check_in);
  });
  const ventanas = Array.from(ventanasSet).sort();

  // ADR propio Casa Mendilore por ventana (calculado desde reservas reales vía función SQL)
  const adrPropioPorVentana = new Map<string, number>();
  try {
    const supabase2 = createAdminClient();
    for (const checkIn of ventanas) {
      const { data: adr } = await supabase2.rpc("adr_propio_para_fecha", { p_fecha: checkIn });
      if (adr !== null && adr !== undefined && Number(adr) > 0) {
        adrPropioPorVentana.set(checkIn, Number(adr));
      }
    }
  } catch (err) {
    // Si la función no existe aún (migration 0019 no aplicada), seguimos sin datos propios
  }

  // Estadísticos por ventana (media, min, max, n disponibles)
  type Estadistico = { media: number; min: number; max: number; nDisponibles: number; nTotal: number; moneda: string };
  const estadisticosPorVentana = new Map<string, Estadistico>();
  ventanas.forEach((check_in) => {
    const precios: number[] = [];
    let moneda = "EUR";
    let nTotal = 0;
    competidores.forEach((c: any) => {
      const s = ultimosPorVentana.get(`${c.id}|${check_in}`);
      if (s) {
        nTotal++;
        const pn = s.precio_por_noche != null ? Number(s.precio_por_noche) : NaN;
        if (s.disponible && !isNaN(pn) && pn > 0) {
          precios.push(pn);
          moneda = s.moneda || "EUR";
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
        moneda,
      });
    }
  });

  return (
    <div>
      <PageHeader
        title="Competencia"
        description={`${competidores.length} hoteles · ${ventanas.length} ${ventanas.length === 1 ? "ventana" : "ventanas"} temporales · precios por noche (€/n)`}
      />

      {pageError && (
        <div className="bg-card border border-orange-300 dark:border-orange-800 rounded-xl p-5 mb-5">
          <h2 className="text-base font-semibold text-foreground mb-1">⚠️ Error al cargar competencia</h2>
          <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer">Detalle</summary><code className="block mt-2 p-2 bg-muted/40 rounded">{pageError}</code></details>
        </div>
      )}

      {competidores.length === 0 ? (
        <EmptyState
          title="Sin competidores cargados"
          description="No hay competidores activos en la base de datos."
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

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3 text-xs">
              <div className="flex-1 min-w-[260px]">
                <div className="text-sm font-semibold text-foreground mb-1">¿Cómo leer esta pantalla?</div>
                <div className="text-muted-foreground leading-relaxed">
                  Cada celda muestra el <strong>precio por noche</strong> del competidor para esa ventana de entrada.
                  El color compara su precio con la media del mercado en esa misma ventana.
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500"></span>
                  <span className="text-foreground"><strong className="text-emerald-700 dark:text-emerald-400">Más barato</strong></span>
                  <span className="text-muted-foreground">— al menos 10% por debajo de la media</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm bg-slate-400"></span>
                  <span className="text-foreground">En mercado</span>
                  <span className="text-muted-foreground">— ±10% respecto a la media</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm bg-orange-500"></span>
                  <span className="text-foreground"><strong className="text-orange-700 dark:text-orange-400">Más caro</strong></span>
                  <span className="text-muted-foreground">— al menos 10% por encima</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400">Sold out</span>
                  <span className="text-muted-foreground">— sin disponibilidad esa fecha</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">
              <strong className="text-foreground">Origen:</strong> scraper propio sobre Booking.com vía Apify · captura diaria · {ventanas.length} ventanas configuradas · valor "/n" = precio por noche.
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th key="hotel-col" className="text-left font-medium px-4 py-3 sticky left-0 bg-muted/50 z-10 min-w-[220px]" title="Hotel competidor o Casa Mendilore. Los competidores se cargan vía scraper diario de Booking; nuestra fila usa el ADR real de las reservas registradas.">Hotel</th>
                  {ventanas.map((check_in) => {
                    const lab = ventanaLabel(check_in);
                    return (
                      <th key={check_in} className="text-right font-medium px-4 py-3 min-w-[120px]"
                        title={`Ventana de entrada ${check_in}. Cada celda muestra el precio por noche (ADR) que ese hotel ofrece a un huésped que entrara esa fecha. El último snapshot capturado por el scraper se considera vigente.`}>
                        <div className="text-foreground capitalize">{lab.primary}</div>
                        <div className="text-[10px] text-muted-foreground font-normal mt-0.5">{lab.secondary}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {competidores.map((c: any) => (
                  <tr key={c.id} className={c.es_propia ? "bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40" : "hover:bg-muted/30"}>
                    <td className={`px-4 py-3 sticky left-0 z-10 ${c.es_propia ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-card"}`}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                            <span className="truncate">{c.nombre || "—"}</span>
                            {c.es_propia && <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide bg-emerald-600 text-white font-bold shrink-0">Nosotros</span>}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {c.estrellas ? "★".repeat(c.estrellas) : ""}
                          </div>
                        </div>
                        {c.booking_url && (
                          <Link href={c.booking_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                            <ExternalLink className="size-4" />
                          </Link>
                        )}
                      </div>
                    </td>
                    {ventanas.map((check_in) => {
                      const est = estadisticosPorVentana.get(check_in);
                      // Si es Casa Mendilore (nosotros), usar ADR propio calculado desde reservas
                      if (c.es_propia) {
                        const adr = adrPropioPorVentana.get(check_in);
                        if (!adr || adr <= 0) {
                          return (
                            <td key={check_in} className="px-4 py-3 text-right text-muted-foreground italic text-[10px]">
                              sin reservas
                            </td>
                          );
                        }
                        let colorClass = "text-foreground";
                        if (est && est.nDisponibles >= 2) {
                          const desv = ((adr - est.media) / est.media) * 100;
                          if (desv <= -10) colorClass = "text-emerald-700 dark:text-emerald-400";
                          else if (desv >= 10) colorClass = "text-orange-700 dark:text-orange-400";
                        }
                        return (
                          <td key={check_in} className="px-4 py-3 text-right">
                            <div className={`font-semibold ${colorClass}`}>
                              {formatCurrency(adr, "EUR")}/n
                            </div>
                            <div className="text-[9px] text-muted-foreground">nuestro ADR</div>
                          </td>
                        );
                      }
                      const s = ultimosPorVentana.get(`${c.id}|${check_in}`);
                      if (!s) {
                        return (
                          <td key={check_in} className="px-4 py-3 text-right text-muted-foreground italic text-xs">—</td>
                        );
                      }
                      const pn = s.precio_por_noche != null ? Number(s.precio_por_noche) : NaN;
                      if (!s.disponible) {
                        return (
                          <td key={check_in} className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400">Sold out</span>
                          </td>
                        );
                      }
                      if (isNaN(pn) || pn <= 0) {
                        // Disponible en Booking pero el robot no pudo leer el precio
                        // (p.ej. estancia mínima) — NO es "Completo".
                        return (
                          <td key={check_in} className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400" title="El hotel aparece disponible en Booking pero no pudimos leer su precio para esta ventana (suele ser por estancia mínima).">Sin precio</span>
                          </td>
                        );
                      }
                      let colorClass = "text-foreground";
                      let icon: any = null;
                      if (est && est.nDisponibles >= 2) {
                        const desviacion = ((pn - est.media) / est.media) * 100;
                        if (desviacion <= -10) {
                          colorClass = "text-emerald-700 dark:text-emerald-400";
                          icon = <TrendingDown className="size-3" />;
                        } else if (desviacion >= 10) {
                          colorClass = "text-orange-700 dark:text-orange-400";
                          icon = <TrendingUp className="size-3" />;
                        } else {
                          icon = <Minus className="size-3 text-muted-foreground" />;
                        }
                      }
                      const moneda = s.moneda || "EUR";
                      return (
                        <td key={check_in} className="px-4 py-3 text-right">
                          <div className={`font-semibold inline-flex items-center gap-1 ${colorClass}`}>
                            {icon}
                            {formatCurrency(pn, moneda)}/n
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-muted/30 font-medium">
                  <td className="px-4 py-3 sticky left-0 bg-muted/30 z-10"
                    title="Promedio de precio por noche entre los competidores con disponibilidad en esa ventana. Excluye sold out. Si una ventana tiene menos de 2 hoteles disponibles, no se usa esta media para colorear las celdas (no es representativa).">
                    <div className="text-sm text-foreground">Media mercado <span className="text-[10px] text-muted-foreground font-normal ml-1">ⓘ</span></div>
                  </td>
                  {ventanas.map((check_in) => {
                    const est = estadisticosPorVentana.get(check_in);
                    if (!est || est.nDisponibles === 0) {
                      return <td key={check_in} className="px-4 py-3 text-right text-muted-foreground italic text-xs">—</td>;
                    }
                    return (
                      <td key={check_in} className="px-4 py-3 text-right">
                        <div className="text-foreground font-semibold">{formatCurrency(est.media, est.moneda)}/n</div>
                        <div className="text-[10px] text-muted-foreground">{est.nDisponibles}/{est.nTotal} libres</div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Gráfico evolución 60d — Bloque 10 final */}
          {(() => {
            // Para cada ventana, agregar precio MEDIO del mercado por día de snapshot
            const proximasVentanas = ventanas
              .filter((v) => v >= new Date().toISOString().slice(0, 10))
              .slice(0, 3);
            if (proximasVentanas.length === 0) return null;
            // fecha_snapshot -> ventana -> precios[]
            const matriz = new Map<string, Map<string, number[]>>();
            snapshots.forEach((sn: any) => {
              if (!sn.fecha_snapshot || !sn.check_in || !sn.disponible) return;
              if (!proximasVentanas.includes(sn.check_in)) return;
              const pn = Number(sn.precio_por_noche);
              if (!pn || pn <= 0) return;
              if (!matriz.has(sn.fecha_snapshot)) matriz.set(sn.fecha_snapshot, new Map());
              const m = matriz.get(sn.fecha_snapshot)!;
              if (!m.has(sn.check_in)) m.set(sn.check_in, []);
              m.get(sn.check_in)!.push(pn);
            });
            const fechas = Array.from(matriz.keys()).sort();
            if (fechas.length < 2) return null;
            // Series: por ventana, array de {fecha, media}
            type Punto = { fecha: string; media: number };
            const series: { ventana: string; label: string; color: string; puntos: Punto[] }[] = proximasVentanas.map((v, i) => {
              const color = ["#0f766e", "#0369a1", "#a16207"][i];
              const lab = ventanaLabel(v);
              const puntos: Punto[] = fechas
                .map((fe) => {
                  const ms = matriz.get(fe);
                  const arr = ms?.get(v);
                  if (!arr || arr.length === 0) return null;
                  const media = arr.reduce((a, b) => a + b, 0) / arr.length;
                  return { fecha: fe, media };
                })
                .filter((p): p is Punto => p !== null);
              return { ventana: v, label: `${lab.primary} · ${lab.secondary}`, color, puntos };
            }).filter(s => s.puntos.length >= 2);

            if (series.length === 0) return null;

            // Calcular bounds Y
            const todosLosValores = series.flatMap(s => s.puntos.map(p => p.media));
            const yMin = Math.floor(Math.min(...todosLosValores) * 0.95);
            const yMax = Math.ceil(Math.max(...todosLosValores) * 1.05);
            const xMin = new Date(fechas[0]).getTime();
            const xMax = new Date(fechas[fechas.length - 1]).getTime();
            const W = 720, H = 220, PAD_L = 50, PAD_R = 12, PAD_T = 16, PAD_B = 28;
            const sx = (t: number) => PAD_L + ((t - xMin) / Math.max(1, xMax - xMin)) * (W - PAD_L - PAD_R);
            const sy = (v: number) => PAD_T + (1 - (v - yMin) / Math.max(1, yMax - yMin)) * (H - PAD_T - PAD_B);

            // Eje Y: 4 ticks
            const yTicks = [yMin, yMin + (yMax - yMin) * 0.33, yMin + (yMax - yMin) * 0.66, yMax].map(v => Math.round(v));

            return (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h2 className="text-base font-semibold text-foreground">Evolución precio medio mercado · últimos {fechas.length} días</h2>
                  <span className="text-[11px] text-muted-foreground">3 ventanas más cercanas</span>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Cada línea es la media de los competidores disponibles para una ventana de entrada concreta. Si una línea sube, el mercado está pidiendo más; si baja, hay presión para abaratar.
                </p>
                <div className="overflow-x-auto">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px] h-auto">
                    {/* Grid Y */}
                    {yTicks.map((v, i) => (
                      <g key={i}>
                        <line x1={PAD_L} x2={W - PAD_R} y1={sy(v)} y2={sy(v)} stroke="currentColor" strokeOpacity="0.08" />
                        <text x={PAD_L - 6} y={sy(v) + 3} fontSize="10" textAnchor="end" fill="currentColor" fillOpacity="0.55">{v}€</text>
                      </g>
                    ))}
                    {/* Eje X: primer y último */}
                    <text x={PAD_L} y={H - 8} fontSize="10" fill="currentColor" fillOpacity="0.55">{fechas[0]}</text>
                    <text x={W - PAD_R} y={H - 8} fontSize="10" textAnchor="end" fill="currentColor" fillOpacity="0.55">{fechas[fechas.length - 1]}</text>
                    {/* Series */}
                    {series.map((s, si) => {
                      const path = s.puntos
                        .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(new Date(p.fecha).getTime())} ${sy(p.media)}`)
                        .join(" ");
                      return (
                        <g key={si}>
                          <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          {s.puntos.map((p, i) => (
                            <circle key={i} cx={sx(new Date(p.fecha).getTime())} cy={sy(p.media)} r="2.5" fill={s.color}>
                              <title>{`${p.fecha}: ${p.media.toFixed(0)}€/n (${s.label})`}</title>
                            </circle>
                          ))}
                        </g>
                      );
                    })}
                  </svg>
                </div>
                {/* Leyenda */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs">
                  {series.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }}></span>
                      <span className="text-foreground capitalize">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Diagnóstico Sold out */}
          {(() => {
            type Diag = { competidor: any; total: number; soldout: number; sinDato: number; pct: number };
            const diag: Diag[] = competidores.filter((c: any) => !c.es_propia).map((c: any) => {
              let total = 0, soldout = 0, sinDato = 0;
              ventanas.forEach((cin) => {
                const snap = ultimosPorVentana.get(`${c.id}|${cin}`);
                if (!snap) { sinDato++; return; }
                total++;
                if (!snap.disponible) soldout++;
                else if (!snap.precio_por_noche || Number(snap.precio_por_noche) <= 0) sinDato++;
              });
              const pct = total > 0 ? Math.round((soldout / total) * 100) : 0;
              return { competidor: c, total, soldout, sinDato, pct };
            });
            const problemas = diag.filter(d => d.pct >= 50 || d.sinDato > ventanas.length / 2);
            if (problemas.length === 0) return null;
            return (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="text-amber-700 dark:text-amber-400 text-lg leading-none">⚠</div>
                  <div className="flex-1 text-xs">
                    <div className="text-sm font-semibold text-foreground mb-1">Diagnóstico: posibles problemas de captura</div>
                    <div className="text-muted-foreground mb-2 leading-relaxed">
                      Estos hoteles aparecen mayoritariamente como <strong>"Sold out"</strong> o sin dato en todas las ventanas. Puede deberse a tres causas:
                    </div>
                    <ul className="list-disc pl-5 mb-3 text-muted-foreground space-y-0.5">
                      <li>La URL de Booking que tenemos guardada no corresponde a su ficha real (errata, redirección, hotel cerrado o de temporada).</li>
                      <li>Bloquean al scraper o exigen ocupación mínima que no coincide con nuestras ventanas (ej. solo grupos, solo 7 noches mínimo).</li>
                      <li>Realmente están sin disponibilidad para esas fechas (cierre temporada, evento privado, vendido).</li>
                    </ul>
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-left font-medium pb-1">Hotel</th>
                          <th className="text-right font-medium pb-1">Sold out / total</th>
                          <th className="text-right font-medium pb-1">Sin captura</th>
                          <th className="text-left font-medium pb-1 pl-3">URL Booking</th>
                        </tr>
                      </thead>
                      <tbody>
                        {problemas.map((d) => (
                          <tr key={d.competidor.id} className="border-t border-amber-200/60 dark:border-amber-900/60">
                            <td className="py-1.5 pr-2 font-medium text-foreground">{d.competidor.nombre}</td>
                            <td className="py-1.5 pr-2 text-right">{d.soldout} / {d.total} <span className="text-muted-foreground">({d.pct}%)</span></td>
                            <td className="py-1.5 pr-2 text-right text-muted-foreground">{d.sinDato} ventanas</td>
                            <td className="py-1.5 pl-3 text-muted-foreground">
                              {d.competidor.booking_url ? (
                                <Link href={d.competidor.booking_url} target="_blank" rel="noopener noreferrer" className="hover:text-foreground inline-flex items-center gap-1 underline">
                                  abrir <ExternalLink className="size-3" />
                                </Link>
                              ) : <span className="italic">sin URL</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-3 text-[11px] text-muted-foreground italic">
                      Recomendación: abrir cada URL, comprobar si la ficha es la del hotel correcto y si efectivamente está cerrado para esas fechas. Si la URL está mal, actualizarla en Configuración → Competidores (próxima sesión).
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}

