export const runtime = 'edge';

import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Huéspedes" };

export default async function HuespedesPage() {
  const supabase = await createClient();
  const { data: huespedes, count } = await supabase
    .from("huespedes")
    .select("id, nombre, apellidos, email, telefono, pais, fecha_alta, fuente", { count: "exact" })
    .order("fecha_alta", { ascending: false })
    .limit(200);

  return (
    <div>
      <PageHeader
        title="Huéspedes"
        description={`${count ?? 0} contactos registrados`}
      />

      {!huespedes || huespedes.length === 0 ? (
        <EmptyState
          title="No hay huéspedes todavía"
          description="Los huéspedes se crearán automáticamente al sincronizar las reservas de MisterPlan. También puedes añadirlos manualmente."
          icon={<Users className="size-5" />}
        />
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Nombre</th>
                <th className="text-left font-medium px-5 py-2.5">Email</th>
                <th className="text-left font-medium px-5 py-2.5">Teléfono</th>
                <th className="text-left font-medium px-5 py-2.5">País</th>
                <th className="text-left font-medium px-5 py-2.5">Fuente</th>
                <th className="text-left font-medium px-5 py-2.5">Alta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {huespedes.map((h: any) => (
                <tr key={h.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 text-foreground">{`${h.nombre ?? ""} ${h.apellidos ?? ""}`.trim() || "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{h.email ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{h.telefono ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{h.pais ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{h.fuente ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(h.fecha_alta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
