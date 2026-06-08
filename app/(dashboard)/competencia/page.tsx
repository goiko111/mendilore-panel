import Link from "next/link";
import { ExternalLink, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata = { title: "Competencia" };

export default async function CompetenciaPage() {
  const supabase = await createClient();

  // 6 competidores (D-118)
  const { data: competidores } = await supabase
    .from("competidores")
    .select("id, nombre, booking_url, web_propia, estrellas, notas, activo")
    .eq("activo", true)
    .order("nombre");

  // Todos los snapshots, ordenados por fecha_snapshot DESC y check_in DESC para que
  // el snapshot más reciente (con tie-breaker estable) sea el primero por competidor.
  const { data: todosPrecios } = await supabase
    .from("precios_competidores_dia")
    .select("competidor_id, fecha_snapshot, check_in, check_out, precio_total, precio_por_noche, moneda, disponible, rating, rating_label, reviews_count")
    .order("fecha_snapshot", { ascending: false })
    .order("check_in", { ascending: false });

  // Dos mapas: el último snapshot (sea o no disponible) y el último disponible (precio conocido).
  // Si el último snapshot está sold out, mostramos también el último con precio como referencia histórica.
  const ultimoMap = new Map<string, any>();
  const ultimoDisponibleMap = new Map<string, any>();
  todosPrecios?.forEach((p) => {
    if (!ultimoMap.has(p.competidor_id)) ultimoMap.set(p.competidor_id, p);
    if (p.disponible && p.precio_por_noche && !ultimoDisponibleMap.has(p.competidor_id)) {
      ultimoDisponibleMap.set(p.competidor_id, p);
    }
  });

  return (
    <div>
      <PageHeader
        title="Competencia"
        description="6 hoteles monitorizados en Booking.com · datos actualizados desde Apify scraper"
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {competidores.map((c) => {
            const ultimo = ultimoMap.get(c.id);
            const ultimoDisp = ultimoDisponibleMap.get(c.id);
            // Prioridad de visualización: si el último snapshot tiene precio, mostrarlo.
            // Si está sold out pero existe otro snapshot disponible, mostrarlo como "último conocido".
            const principal = ultimo?.disponible && ultimo?.precio_por_noche ? ultimo : (ultimoDisp ?? ultimo);
            const mostrarSoldOutActual = principal && !principal.disponible;
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{c.nombre}</h3>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.estrellas ? "★".repeat(c.estrellas) : ""} {principal?.rating ? `· ${principal.rating} ${principal.rating_label ?? ""}` : ""}
                    </div>
                  </div>
                  <Link href={c.booking_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-4" />
                  </Link>
                </div>

                {principal ? (
                  <div className="space-y-2 flex-1">
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {mostrarSoldOutActual ? "Último precio conocido" : "Precio último snapshot"}
                      </div>
                      <div className="text-xl font-semibold text-foreground">
                        {principal.disponible && principal.precio_por_noche
                          ? `${formatCurrency(principal.precio_por_noche, principal.moneda)}/noche`
                          : "Sold out"}
                      </div>
                      {principal.disponible && principal.precio_total && (
                        <div className="text-xs text-muted-foreground">Total {formatCurrency(principal.precio_total, principal.moneda)}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground border-t border-border pt-2">
                      Para fechas {formatDate(principal.check_in, { day: "numeric", month: "short" })} → {formatDate(principal.check_out, { day: "numeric", month: "short" })}
                      <br />
                      Scrapeado: {formatDate(principal.fecha_snapshot)}
                      {principal.reviews_count ? ` · ${principal.reviews_count} reviews` : ""}
                    </div>
                    {ultimo && ultimo !== principal && !ultimo.disponible && (
                      <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md px-2 py-1.5">
                        Sold out para {formatDate(ultimo.check_in, { day: "numeric", month: "short" })} → {formatDate(ultimo.check_out, { day: "numeric", month: "short" })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic flex-1">
                    Sin datos todavía. Esperando primera ejecución del scraper.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
