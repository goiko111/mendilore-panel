export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Bell, BellRing, Check } from "lucide-react";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Notificaciones" };

export default async function NotificacionesPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const onlyUnread = sp.filter === "unread";

  const supabase = await createClient();
  let query = supabase
    .from("notificaciones")
    .select("id, tipo, titulo, mensaje, reserva_id, leida, leida_en, creada_en, metadata")
    .order("creada_en", { ascending: false })
    .limit(200);

  if (onlyUnread) query = query.eq("leida", false);

  const { data: notifs } = await query;

  const unreadCount = (notifs ?? []).filter(n => !n.leida).length;

  return (
    <div>
      <PageHeader
        title="Notificaciones"
        description={`${notifs?.length ?? 0} notificaciones · ${unreadCount} sin leer`}
      />

      <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border border-border w-fit mb-5">
        <Link href="/notificaciones" className={`px-3 py-1.5 text-xs font-medium rounded transition ${!onlyUnread ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          Todas ({notifs?.length ?? 0})
        </Link>
        <Link href="/notificaciones?filter=unread" className={`px-3 py-1.5 text-xs font-medium rounded transition ${onlyUnread ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          Sin leer ({unreadCount})
        </Link>
        {unreadCount > 0 && (
          <form action="/api/notificaciones/marcar-todas" method="post" className="ml-2">
            <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded text-muted-foreground hover:text-foreground hover:bg-muted transition inline-flex items-center gap-1">
              <Check className="size-3" /> Marcar todas leídas
            </button>
          </form>
        )}
      </div>

      {!notifs || notifs.length === 0 ? (
        <EmptyState
          title={onlyUnread ? "Sin notificaciones pendientes" : "Aún no hay notificaciones"}
          description="Cuando llegue una reserva nueva o haya un cobro pendiente, aparecerá aquí."
          icon={<Bell className="size-5" />}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {notifs.map((n: any) => {
            const icon = n.tipo === "reserva_nueva" ? "📅" : n.tipo === "cobro_pendiente" ? "💶" : n.tipo === "reserva_cancelada" ? "❌" : n.tipo === "alerta_competencia" ? "📊" : "🔔";
            return (
              <div key={n.id} className={`px-5 py-4 flex items-start gap-3 ${!n.leida ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}`}>
                <div className="text-2xl shrink-0 leading-none mt-0.5">{icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-foreground">{n.titulo}</div>
                    {!n.leida && <BellRing className="size-3.5 text-amber-600 shrink-0 mt-1" />}
                  </div>
                  {n.mensaje && <div className="text-sm text-muted-foreground mt-1">{n.mensaje}</div>}
                  <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-2">
                    <span>{new Date(n.creada_en).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</span>
                    {n.reserva_id && (
                      <Link href={`/reservas?q=${n.reserva_id.slice(0, 8)}`} className="text-primary hover:underline">
                        Ver reserva →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
