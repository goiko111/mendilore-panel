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
    const { data: c, error: ec } = await supabase
      .from("competidores")
      .select("id, nombre, booking_url, estrellas, es_propia")
      .eq("activo", true)
      .order("es_propia", { ascending: false })  // Casa Mendilore primero
      .order("nombre");
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
                  <th key="hotel-col" className="text-left font-medium px-4 py-3 sticky left-0 bg-muted/50 z-10 min-w-[220px]">Hotel</th>
                  {ventanas.map((check_in) => {
                    const lab = ventanaLabel(check_in);
                    return (
                      <th key={check_in} className="text-right font-medium px-4 py-3 min-w-[120px]">
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
                      if (!s.disponible || isNaN(pn) || pn <= 0) {
                        return (
                          <td key={check_in} className="px-4 py-3 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400">Sold out</span>
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
                  <td className="px-4 py-3 sticky left-0 bg-muted/30 z-10">
                    <div className="text-sm text-foreground">Media mercado</div>
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

        </div>
      )}
    </div>
  );
}
