export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ShieldCheck, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from("perfiles").select("*").eq("id", user?.id ?? "").maybeSingle();

  // Documentos legales vigentes (Fase 3). Usamos admin client porque los textos
  // legales NO son PII de huéspedes y queremos evitar problemas de RLS en SSR Edge.
  const admin = createAdminClient();
  const { data: documentosLegales } = await admin
    .from("documentos_legales")
    .select("id, tipo, version, titulo, hash_sha256, vigente, publicado_en")
    .eq("vigente", true)
    .order("tipo");

  const { count: aceptacionesCount } = await admin
    .from("aceptaciones_condiciones")
    .select("*", { count: "exact", head: true });

  const integraciones = [
    { name: "MisterPlan / RuralGest", status: "pendiente", note: "Scraper plantilla lista (D-132). Implementación sesión 10." },
    { name: "Make.com — Org Casa Mendilore", status: "activo", note: "Org 7922550 · eu1 · Free 1.000 credits/mes (D-109)" },
    { name: "Apify Booking scraper", status: "activo", note: "Schedule lunes 7am Madrid · webhook nativo (D-118, D-132)" },
    { name: "Supabase", status: "activo", note: "Project mendilore-panel · eu-central-1 · 4 migrations (D-108)" },
    { name: "Cloudflare Pages", status: "activo", note: "panel.mendilore.com · auto-deploy desde GitHub main" }
  ];

  const tiposLegibles: Record<string, string> = {
    condiciones_particulares: "Condiciones particulares",
    politica_cancelacion: "Política de cancelación",
    politica_mascotas: "Política de mascotas",
    politica_privacidad: "Política de privacidad",
    cookies: "Política de cookies",
    otro: "Otro"
  };

  return (
    <div>
      <PageHeader title="Configuración" description="Integraciones, usuarios, documentos legales y opciones del panel" />

      <div className="space-y-6">
        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Tu perfil</h2>
          <p className="text-xs text-muted-foreground mb-4">Datos de tu cuenta de acceso</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Email</dt>
              <dd className="text-foreground">{user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Nombre</dt>
              <dd className="text-foreground">{perfil?.nombre ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Rol</dt>
              <dd className="text-foreground">{perfil?.rol ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Organización</dt>
              <dd className="text-foreground">{perfil?.organizacion ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-semibold text-foreground">Documentos legales vigentes</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Versiones activas con hash SHA-256 para evidencia jurídica (Fase 3 · sec 3.4) ·{" "}
            <span className="font-medium text-foreground">{aceptacionesCount ?? 0}</span> aceptaciones registradas
          </p>

          {!documentosLegales || documentosLegales.length === 0 ? (
            <div className="text-sm text-muted-foreground italic py-2">
              No hay documentos legales publicados todavía.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Tipo</th>
                    <th className="text-left font-medium px-4 py-2">Título</th>
                    <th className="text-left font-medium px-4 py-2">Versión</th>
                    <th className="text-left font-medium px-4 py-2">Hash SHA-256</th>
                    <th className="text-left font-medium px-4 py-2">Publicado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {documentosLegales.map((d: any) => (
                    <tr key={d.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <FileText className="size-3.5 text-muted-foreground" />
                          {tiposLegibles[d.tipo] ?? d.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{d.titulo}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{d.version}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs" title={d.hash_sha256}>
                        {d.hash_sha256.slice(0, 12)}…{d.hash_sha256.slice(-6)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(d.publicado_en)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            Cada aceptación de un huésped queda registrada en BD con timestamp UTC + IP + hash del documento.
            La función SQL <code className="text-foreground bg-muted px-1 py-0.5 rounded">verificar_aceptacion(uuid)</code>{" "}
            permite auditar la integridad de cualquier aceptación. Conservación 6 años (plazo mercantil).
          </p>
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-base font-semibold text-foreground mb-1">Integraciones</h2>
          <p className="text-xs text-muted-foreground mb-4">Servicios conectados al panel</p>
          <ul className="divide-y divide-border">
            {integraciones.map((i) => (
              <li key={i.name} className="py-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{i.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{i.note}</div>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  i.status === "activo"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}>
                  {i.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
