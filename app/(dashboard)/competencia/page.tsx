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
  const supabase = createAdminClient();

  const { data: competidores } = await supabase
    .from("competidores")
    .select("id, nombre, booking_url, estrellas")
    .eq("activo", true)
    .order("nombre");

  const desde60d = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const { data: snapshots } = await supabase
    .from("precios_competidores_dia")
    .select("competidor_id, fecha_snapshot, check_in, check_out, precio_total, precio_por_noche, moneda, disponible, rating, rating_label, reviews_count")
    .gte("fecha_snapshot", desde60d)
    .order("check_in", { ascending: true });

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

  return (
    <div>
      <PageHeader
        title="Competencia"
        description={`${(competidores ?? []).length} hoteles · ${ventanas.length} ${ventanas.length === 1 ? "ventana" : "ventanas"} temporales · precios por noche (€/n) para estancias de 3 noches · 2 adultos`}
        actions={
          <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            Refresca cada lunes 07:00
          </span>
        }
      />

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
          </div>
        </div>
      )}
    </div>
  );
}
