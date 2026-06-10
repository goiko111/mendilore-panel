export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatCard } from "@/components/page-header";
import { formatDate } from "@/lib/utils";
import { NuevaTareaForm, ToggleTarea } from "./tareas-client";

export const metadata = { title: "Tareas" };

export default async function TareasPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const filter = sp.filter || "pendientes";

  const supabase = await createClient();
  let query = supabase
    .from("tareas")
    .select("id, titulo, descripcion, fecha_limite, prioridad, estado, asignado_a, creada_en, completada_en, reserva_id, huesped_id")
    .order("fecha_limite", { ascending: true, nullsFirst: false })
    .order("prioridad", { ascending: false })
    .limit(500);

  if (filter === "pendientes") query = query.eq("estado", "pendiente");
  if (filter === "completadas") query = query.eq("estado", "completada");

  const { data: tareas } = await query;

  const todayStr = new Date().toISOString().slice(0, 10);
  const totalPendientes = (tareas ?? []).filter(t => t.estado === "pendiente").length;
  const totalCompletadas = (tareas ?? []).filter(t => t.estado === "completada").length;
  const vencenHoy = (tareas ?? []).filter(t => t.fecha_limite === todayStr && t.estado === "pendiente").length;
  const vencidas = (tareas ?? []).filter(t => t.fecha_limite && t.fecha_limite < todayStr && t.estado === "pendiente").length;

  return (
    <div>
      <PageHeader title="Tareas" description={`Gestor de tareas y recordatorios del equipo`} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard label="Pendientes" value={String(totalPendientes)} hint="Sin completar" />
        <StatCard label="Vencen hoy" value={String(vencenHoy)} hint={vencenHoy > 0 ? "🔥 Urgentes" : "Sin urgentes"} />
        <StatCard label="Vencidas" value={String(vencidas)} hint={vencidas > 0 ? "⚠️ Revisar" : "Al día"} />
        <StatCard label="Completadas" value={String(totalCompletadas)} hint="Histórico" />
      </div>

      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border border-border w-fit">
          <Link href="/tareas?filter=pendientes" className={`px-3 py-1.5 text-xs font-medium rounded transition ${filter === "pendientes" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Pendientes ({totalPendientes})
          </Link>
          <Link href="/tareas?filter=completadas" className={`px-3 py-1.5 text-xs font-medium rounded transition ${filter === "completadas" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Completadas ({totalCompletadas})
          </Link>
          <Link href="/tareas?filter=todas" className={`px-3 py-1.5 text-xs font-medium rounded transition ${filter === "todas" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Todas
          </Link>
        </div>
        <NuevaTareaForm />
      </div>

      {!tareas || tareas.length === 0 ? (
        <EmptyState
          title="Sin tareas"
          description="Pulsa 'Nueva tarea' arriba para crear la primera."
          icon={<ClipboardList className="size-5" />}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {tareas.map((t: any) => {
            const vencida = t.fecha_limite && t.fecha_limite < todayStr && t.estado === "pendiente";
            const hoy = t.fecha_limite === todayStr;
            const prioridadColor = t.prioridad === "alta" ? "text-red-700 dark:text-red-400" : t.prioridad === "baja" ? "text-muted-foreground" : "text-foreground";
            return (
              <div key={t.id} className={`px-5 py-3 flex items-center gap-3 ${t.estado === "completada" ? "opacity-60" : ""}`}>
                <ToggleTarea id={t.id} completada={t.estado === "completada"} />
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm ${prioridadColor} ${t.estado === "completada" ? "line-through" : ""}`}>
                    {t.prioridad === "alta" && "🔴 "}
                    {t.titulo}
                  </div>
                  {t.descripcion && <div className="text-xs text-muted-foreground mt-0.5">{t.descripcion}</div>}
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                    {t.fecha_limite && (
                      <span className={vencida ? "text-red-700 dark:text-red-400 font-medium" : hoy ? "text-amber-700 dark:text-amber-400 font-medium" : ""}>
                        {vencida ? "Vencida " : hoy ? "Hoy " : ""}{formatDate(t.fecha_limite)}
                      </span>
                    )}
                    {t.asignado_a && <span>· {t.asignado_a}</span>}
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
