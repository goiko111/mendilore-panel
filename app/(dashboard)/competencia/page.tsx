export const runtime = 'edge';

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

  // último snapshot por competidor
  const { data: ultimosPrecios } = await supabase
    .from("precios_competidores_dia")
    .select("competidor_id, fecha_snapshot, check_in, check_out, precio_total, precio_por_noche, moneda, disponible, rating, rating_label, reviews_count")
    .order("fecha_snapshot", { ascending: false });

  // mapa competidor_id → último snapshot
  const ultimosMap = new Map<string, any>();
  ultimosPrecios?.forEach((p) => {
    if (!ultimosMap.has(p.competidor_id)) ultimosMap.set(p.competidor_id, p);
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
            const ultimo = ultimosMap.get(c.id);
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{c.nombre}</h3>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.estrellas ? "★".repeat(c.estrellas) : ""} {ultimo?.rating ? `· ${ultimo.rating} ${ultimo.rating_label ?? ""}` : ""}
                    </div>
                  </div>
                  <Link href={c.booking_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-4" />
                  </Link>
                </div>

                {ultimo ? (
                  <div className="space-y-2 flex-1">
                    <div>
                      <div className="text-xs text-muted-foreground">Precio último snapshot</div>
                      <div className="text-xl font-semibold text-foreground">
                        {ultimo.disponible && ultimo.precio_por_noche
                          ? `${formatCurrency(ultimo.precio_por_noche, ultimo.moneda)}/noche`
                          : "Sold out"}
                      </div>
                      {ultimo.disponible && ultimo.precio_total && (
                        <div className="text-xs text-muted-foreground">Total {formatCurrency(ultimo.precio_total, ultimo.moneda)}</div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground border-t border-border pt-2">
                      Para fechas {formatDate(ultimo.check_in, { day: "numeric", month: "short" })} → {formatDate(ultimo.check_out, { day: "numeric", month: "short" })}
                      <br />
                      Scrapeado: {formatDate(ultimo.fecha_snapshot)}
                      {ultimo.reviews_count ? ` · ${ultimo.reviews_count} reviews` : ""}
                    </div>
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
