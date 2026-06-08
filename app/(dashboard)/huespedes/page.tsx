export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/page-header";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Huéspedes" };

const FUENTES = ["directo", "booking", "airbnb", "expedia", "web_propia", "walk_in", "otro"];

export default async function HuespedesPage({ searchParams }: { searchParams: Promise<{ q?: string; pais?: string; fuente?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("huespedes")
    .select("id, nombre, apellidos, email, telefono, pais, fecha_alta, fuente", { count: "exact" })
    .order("fecha_alta", { ascending: false })
    .limit(200);

  if (sp.pais) query = query.eq("pais", sp.pais);
  if (sp.fuente) query = query.eq("fuente", sp.fuente);

  const { data: huespedesRaw, count } = await query;

  const q = sp.q?.toLowerCase().trim();
  const huespedes = q
    ? (huespedesRaw ?? []).filter((h: any) => {
        const txt = `${h.nombre ?? ""} ${h.apellidos ?? ""} ${h.email ?? ""} ${h.telefono ?? ""}`.toLowerCase();
        return txt.includes(q);
      })
    : (huespedesRaw ?? []);

  // Países únicos para el dropdown
  const paisesUnicos = Array.from(new Set((huespedesRaw ?? []).map((h: any) => h.pais).filter(Boolean))).sort();

  return (
    <div>
      <PageHeader
        title="Huéspedes"
        description={`${huespedes.length} de ${count ?? 0} contactos registrados`}
      />

      <form method="get" className="bg-card border border-border rounded-xl p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Buscar nombre / email / teléfono"
          className="md:col-span-2 px-3 py-1.5 rounded-md border border-border bg-background text-foreground"
        />
        <select name="pais" defaultValue={sp.pais ?? ""} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground">
          <option value="">País: todos</option>
          {paisesUnicos.map((p) => <option key={p as string} value={p as string}>{p as string}</option>)}
        </select>
        <select name="fuente" defaultValue={sp.fuente ?? ""} className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground">
          <option value="">Fuente: todas</option>
          {FUENTES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <div className="md:col-span-4 flex gap-2 justify-end">
          <Link href="/huespedes" className="px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition">
            Limpiar
          </Link>
          <button type="submit" className="bg-foreground text-background hover:bg-foreground/90 px-4 py-1.5 rounded-md font-medium">
            Filtrar
          </button>
        </div>
      </form>

      {huespedes.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="Prueba a quitar filtros."
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
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {huespedes.map((h: any) => (
                <tr key={h.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 text-foreground">
                    <Link href={`/huespedes/${h.id}`} className="hover:underline">
                      {`${h.nombre ?? ""} ${h.apellidos ?? ""}`.trim() || "—"}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{h.email ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{h.telefono ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{h.pais ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{h.fuente ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground">{formatDate(h.fecha_alta)}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/huespedes/${h.id}`} className="text-muted-foreground hover:text-foreground">
                      <ChevronRight className="size-4 inline" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
