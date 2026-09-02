export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ShieldCheck, FileText, ChevronRight } from "lucide-react";
import { EvidenciasBlock } from "@/components/evidencias-block";
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

  // Detectar qué migrations se han aplicado en BD (sesión 12)
  // Cada check es un SELECT mínimo: si tira error la migration no está
  type CheckEstado = { aplicada: boolean; nota?: string };
  async function checkMig(testFn: () => PromiseLike<any>): Promise<CheckEstado> {
    try {
      const r = await testFn();
      if (r.error) return { aplicada: false, nota: r.error.message?.slice(0, 80) };
      return { aplicada: true };
    } catch (e: any) {
      return { aplicada: false, nota: String(e?.message ?? e).slice(0, 80) };
    }
  }

  const mig0017 = await checkMig(() => admin.from("aceptaciones_recordatorios").select("id").limit(1));
  const mig0018 = await checkMig(() => admin.from("reservas").select("legal_enviado_en").limit(1));
  const mig0019 = await checkMig(() => admin.from("competidores").select("es_propia").eq("es_propia", true).limit(1));

  const migrationsPendientes: { id: string; titulo: string; estado: CheckEstado; describe: string }[] = [
    { id: "0017", titulo: "Recordatorios firma legal", estado: mig0017, describe: "Tabla aceptaciones_recordatorios — controla duplicados del cron de recordatorios -7/-3/-1d." },
    { id: "0018", titulo: "Auto-envío legal", estado: mig0018, describe: "Columna reservas.legal_enviado_en — marca cuándo el sistema envió el enlace al crear la reserva." },
    { id: "0019", titulo: "Casa Mendilore en competencia", estado: mig0019, describe: "Columna competidores.es_propia + función adr_propio_para_fecha + fila propia." },
  ];

  const numAplicadas = migrationsPendientes.filter(m => m.estado.aplicada).length;
  const todasAplicadas = numAplicadas === migrationsPendientes.length;

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
              <dt className="text-muted-foreground text-xs">Cuenta</dt>
              <dd className="text-foreground">Casa Mendilore</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Rol</dt>
              <dd className="text-foreground">{perfil?.rol ?? "Administrador"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Conectado desde</dt>
              <dd className="text-foreground">{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString("es-ES", {day:"numeric", month:"long", year:"numeric"}) : "—"}</dd>
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
                    <th className="w-8"></th>
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
                      <td className="px-4 py-2.5 text-foreground">
                        <Link href={`/configuracion/legales/${d.id}`} className="hover:underline">
                          {d.titulo}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{d.version}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs" title={d.hash_sha256}>
                        {d.hash_sha256.slice(0, 12)}…{d.hash_sha256.slice(-6)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatDate(d.publicado_en)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link href={`/configuracion/legales/${d.id}`} className="inline-flex items-center text-muted-foreground hover:text-foreground">
                          <ChevronRight className="size-4" />
                        </Link>
                      </td>
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
          <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-2">
            <span>Estado del sistema</span>
            {todasAplicadas
              ? <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">✓ Todo OK</span>
              : <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">{numAplicadas}/{migrationsPendientes.length} migrations aplicadas</span>}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Estado de las últimas migraciones de base de datos creadas en sesión 12. Si alguna aparece pendiente, pasarle el script <strong>MIGRATIONS_BATCH_SESION13.sql</strong> al SQL Editor de Supabase.
          </p>
          <ul className="divide-y divide-border">
            {migrationsPendientes.map((m) => (
              <li key={m.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{m.id} — {m.titulo}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.describe}</div>
                  {!m.estado.aplicada && m.estado.nota && (
                    <div className="text-[10px] text-muted-foreground mt-1 font-mono">DB dice: {m.estado.nota}</div>
                  )}
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  m.estado.aplicada
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }`}>
                  {m.estado.aplicada ? "✓ aplicada" : "⚠ pendiente"}
                </span>
              </li>
            ))}
          </ul>
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
        <EvidenciasBlock />
    </div>
  );
}

