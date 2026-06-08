export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import Link from "next/link";
import { ArrowLeft, ShieldCheck, AlertTriangle, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Documento legal" };

type Params = { params: Promise<{ id: string }> };

const TIPOS_LEGIBLES: Record<string, string> = {
  condiciones_particulares: "Condiciones particulares",
  politica_cancelacion: "Política de cancelación",
  politica_mascotas: "Política de mascotas",
  politica_privacidad: "Política de privacidad",
  cookies: "Política de cookies",
  otro: "Otro"
};

async function calcSha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default async function DocumentoLegalDetallePage({ params }: Params) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: doc } = await supabase
    .from("documentos_legales")
    .select("id, tipo, version, titulo, contenido, hash_sha256, vigente, publicado_en, notas")
    .eq("id", id)
    .maybeSingle();

  if (!doc) notFound();

  // Verificar integridad recalculando el hash del contenido actual
  const hashRecalculado = await calcSha256(doc.contenido);
  const hashCoincide = hashRecalculado === doc.hash_sha256;

  // Contar aceptaciones de este documento concreto
  const { count: aceptacionesCount } = await supabase
    .from("aceptaciones_condiciones")
    .select("*", { count: "exact", head: true })
    .eq("documento_legal_id", id);

  return (
    <div>
      <div className="mb-2">
        <Link href="/configuracion" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="size-3.5" />
          Volver a Configuración
        </Link>
      </div>

      <PageHeader
        title={doc.titulo}
        description={`${TIPOS_LEGIBLES[doc.tipo] ?? doc.tipo} · versión ${doc.version} · publicado ${formatDate(doc.publicado_en)}`}
        actions={
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
            doc.vigente
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-400"
          }`}>
            {doc.vigente ? "Vigente" : "No vigente"}
          </span>
        }
      />

      <div className="space-y-6">
        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start gap-2 mb-3">
            {hashCoincide ? (
              <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="size-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground">
                Integridad del documento {hashCoincide ? "verificada" : "COMPROMETIDA"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hashCoincide
                  ? "El hash SHA-256 recalculado coincide con el guardado al publicar. El contenido es íntegro."
                  : "El hash SHA-256 NO coincide. El contenido se ha modificado tras la publicación — esto rompe la cadena probatoria. Notifica al equipo legal."}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mt-4">
            <div>
              <dt className="text-muted-foreground">Hash registrado al publicar</dt>
              <dd className="font-mono text-foreground break-all">{doc.hash_sha256}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Hash recalculado ahora</dt>
              <dd className={`font-mono break-all ${hashCoincide ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                {hashRecalculado}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Aceptaciones registradas</dt>
              <dd className="text-foreground font-medium">{aceptacionesCount ?? 0}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Notas</dt>
              <dd className="text-foreground">{doc.notas ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="size-4 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Contenido del documento</h2>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-foreground bg-muted/40 rounded-md p-4 font-sans leading-relaxed">{doc.contenido}</pre>
        </section>
      </div>
    </div>
  );
}
