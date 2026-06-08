export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { ExternalLink, TrendingUp } from "lucide-react";
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

export default async function CompetenciaPage() {
  const supabase = createAdminClient();

  const { data: competidores } = await supabase
    .from("competidores")
    .select("id, nombre, booking_url, estrellas")
    .eq("activo", true)
    .order("nombre");

  // Últimos 60 días de scrapeos para no traer histórico viejo
  const desde60d = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const { data: snapshots } = await supabase
    .from("precios_competidores_dia")
    .select("competidor_id, fecha_snapshot, check_in, check_out, precio_total, precio_por_noche, moneda, disponible, rating, rating_label, reviews_count")
    .gte("fecha_snapshot", desde60d)
    .order("check_in", { ascending: true });

  // Por cada (competidor_id, check_in, check_out) → snapshot más reciente
  const ultimosPorVentana = new Map<string, Snapshot>();
  (snapshots ?? []).forEach((s: any) => {
    const key = `${s.competidor_id}|${s.check_in}|${s.check_out}`;
    const existing = ultimosPorVentana.get(key);
    if (!existing || s.fecha_snapshot > existing.fecha_snapshot) {
      ultimosPorVentana.set(key, s);
    }
  });

  // Ventanas únicas ordenadas por check_in
  const ventanasMap = new Map<string, { check_in: string; check_out: string }>();
  Array.from(ultimosPorVentana.values()).forEach((s) => {
    const key = `${s.check_in}|${s.check_out}`;
    if (!ventanasMap.has(key)) ventanasMap.set(key, { check_in: s.check_in, check_out: s.check_out });
  });
  const ventanas = Array.from(ventanasMap.values()).sort((a, b) => a.check_in.localeCompare(b.check_in));

  // Rating/reviews por competidor (cogemos el primer snapshot con rating)
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

  function precioCelda(competidorId: string, v: { check_in: string; check_out: string }) {
    return ultimosPorVentana.get(`${competidorId}|${v.check_in}|${v.check_out}`);
  }

  function ventanaLabel(v: { check_in: string; check_out: string }) {
    return `${formatDate(v.check_in, { day: "numeric", month: "short" })} → ${formatDate(v.check_out, { day: "numeric", month: "short" })}`;
  }

  return (
    <div>
      <PageHeader
        title="Competencia"
        description={`6 hoteles · ${ventanas.length} ${ventanas.length === 1 ? "ventana" : "ventanas"} monitorizadas · datos desde Apify scraper`}
        actions={
          <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            Próxima actualización: lunes 07:00
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
                  {ventanas.map((v) => (
                    <th key={v.check_in} className="text-right font-medium px-4 py-3 min-w-[140px]">
                      <div className="text-foreground">{ventanaLabel(v)}</div>
                      <div className="text-[10px] text-muted-foreground font-normal mt-0.5">3 noches · 2 adultos</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {competidores.map((c: any) => {
                  const r = ratingsCompetidor.get(c.id);
                  return (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 sticky left-0 bg-card z-10">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">{c.nombre}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {c.estrellas ? "★".repeat(c.estrellas) : ""} {r?.rating ? `· ${r.rating} ${r.rating_label ?? ""}` : ""}
                              {r?.reviews_count ? ` · ${r.reviews_count} reviews` : ""}
                            </div>
                          </div>
                          <Link href={c.booking_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                            <ExternalLink className="size-4" />
                          </Link>
                        </div>
                      </td>
                      {ventanas.map((v) => {
                        const s = precioCelda(c.id, v);
                        if (!s) {
                          return (
                            <td key={v.check_in} className="px-4 py-3 text-right text-muted-foreground italic text-xs">
                              —
                            </td>
                          );
                        }
                        if (!s.disponible || !s.precio_por_noche) {
                          return (
                            <td key={v.check_in} className="px-4 py-3 text-right">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                                Sold out
                              </span>
                            </td>
                          );
                        }
                        return (
                          <td key={v.check_in} className="px-4 py-3 text-right">
                            <div className="font-semibold text-foreground">{formatCurrency(s.precio_por_noche, s.moneda)}/n</div>
                            {s.precio_total && (
                              <div className="text-[10px] text-muted-foreground">{formatCurrency(s.precio_total, s.moneda)} total</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-muted-foreground">
            Cada celda muestra el último precio scrapeado para esa ventana. <strong>Sold out</strong> = el competidor no tiene disponibilidad en esa fecha. <strong>—</strong> = el competidor aún no se ha scrapeado para esa ventana. El scraper Apify se ejecuta automáticamente cada lunes a las 07:00 (Europe/Madrid) cubriendo 4 ventanas: sem próxima · mes próximo · pico verano · low season.
          </div>
        </div>
      )}
    </div>
  );
}
