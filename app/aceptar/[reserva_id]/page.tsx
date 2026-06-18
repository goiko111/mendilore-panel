export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import AceptarForm from "./AceptarForm";

export const metadata = { title: "Aceptar condiciones — Casa Mendilore", robots: { index: false } };

type Params = { params: Promise<{ reserva_id: string }> };

export default async function AceptarPage({ params }: Params) {
  const { reserva_id } = await params;
  const supabase = createAdminClient();

  // Validar que la reserva existe (UUID) — si no, 404
  const { data: reserva } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, importe_total, importe_moneda, huespedes(nombre, apellidos, email)")
    .eq("id", reserva_id)
    .maybeSingle();

  if (!reserva) notFound();

  // Cargar documentos legales vigentes (los 3 que debe aceptar)
  const { data: documentos } = await supabase
    .from("documentos_legales")
    .select("id, tipo, version, titulo, contenido, hash_sha256")
    .eq("vigente", true)
    .in("tipo", ["condiciones_particulares", "politica_cancelacion", "politica_mascotas"])
    .order("tipo");

  // ¿Ya aceptó esta reserva los documentos vigentes?
  const { data: aceptaciones } = await supabase
    .from("aceptaciones_condiciones")
    .select("documento_legal_id, aceptado_en")
    .eq("reserva_id", reserva_id);

  const aceptados = new Set((aceptaciones ?? []).map((a: any) => a.documento_legal_id));
  const todosAceptados = (documentos ?? []).every((d) => aceptados.has(d.id));

  const huesped = (reserva.huespedes as any) ?? {};
  const nombreCompleto = `${huesped.nombre ?? ""} ${huesped.apellidos ?? ""}`.trim();

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <div className="text-xs uppercase tracking-wider text-stone-500 mb-1">Casa Mendilore</div>
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Aceptación de condiciones</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-2">
            {nombreCompleto && (<>Hola, <strong>{nombreCompleto}</strong>. </>)}
            Para completar tu reserva, revisa y acepta las condiciones de la estancia.
          </p>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 mb-6 text-sm">
          <div className="font-medium text-stone-900 dark:text-stone-100 mb-1">Tu reserva</div>
          <dl className="grid grid-cols-2 gap-y-1 gap-x-4 text-stone-600 dark:text-stone-400">
            <dt>Habitación</dt><dd className="text-stone-900 dark:text-stone-100 capitalize">{reserva.habitacion}</dd>
            <dt>Entrada</dt><dd className="text-stone-900 dark:text-stone-100">{new Date(reserva.fecha_in).toLocaleDateString("es-ES")}</dd>
            <dt>Salida</dt><dd className="text-stone-900 dark:text-stone-100">{new Date(reserva.fecha_out).toLocaleDateString("es-ES")}</dd>
            {reserva.importe_total && (
              <>
                <dt>Importe total</dt>
                <dd className="text-stone-900 dark:text-stone-100">{reserva.importe_total} {reserva.importe_moneda ?? "EUR"}</dd>
              </>
            )}
          </dl>
        </div>

        {/* Bloque explicativo: por qué necesitamos esto */}
        <div className="bg-stone-100 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 rounded-xl p-5 mb-6 text-xs text-stone-700 dark:text-stone-300 leading-relaxed">
          <div className="font-semibold text-stone-900 dark:text-stone-100 text-sm mb-2 flex items-center gap-1.5">
            <span>¿Por qué te pedimos esto?</span>
            <span className="text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">RGPD</span>
          </div>
          <p className="mb-2">
            Antes de tu llegada, la ley nos pide guardar una <strong>prueba clara</strong> de que has leído y aceptado las condiciones particulares de Casa Mendilore: política de cancelación, normas de convivencia y política de mascotas si vienes con alguna.
          </p>
          <p className="mb-2">
            Al pulsar <strong>"Aceptar"</strong> guardamos: tu nombre, la fecha y hora exacta, tu dirección IP y una huella digital (SHA-256) del documento que firmaste. Esto nos sirve para demostrar — solo si hiciera falta — qué versión exacta aceptaste y cuándo. No usamos estos datos para marketing.
          </p>
          <p>
            La aceptación se conserva durante <strong>6 años</strong> (plazo mercantil) y luego se elimina. Puedes ejercer tus derechos RGPD escribiendo a <a href="mailto:mendilore@mendilore.com" className="underline text-emerald-700 dark:text-emerald-400">mendilore@mendilore.com</a>. Más info en la <a href="https://mendilore.com/aviso-legal" target="_blank" rel="noopener" className="underline text-emerald-700 dark:text-emerald-400">política de privacidad</a>.
          </p>
        </div>

        {todosAceptados ? (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-5 text-sm text-emerald-900 dark:text-emerald-100">
            <div className="font-semibold mb-1">Condiciones aceptadas</div>
            <p>Ya has aceptado las condiciones para esta reserva. Si tienes alguna duda, contacta con Casa Mendilore en mendilore@mendilore.com o +34 655 745 530.</p>
          </div>
        ) : (
          <AceptarForm
            reservaId={reserva_id}
            huespedNombre={nombreCompleto}
            huespedEmail={huesped.email ?? null}
            documentos={(documentos ?? []).map((d: any) => ({
              id: d.id,
              tipo: d.tipo,
              version: d.version,
              titulo: d.titulo,
              contenido: d.contenido
            }))}
            yaAceptados={Array.from(aceptados) as string[]}
          />
        )}

        <p className="text-xs text-stone-500 mt-8 text-center">
          Casa Mendilore · Jaitzubia Auzoa 27, 20280 Hondarribia (Gipuzkoa) · NIF 44550826X
        </p>
      </div>
    </div>
  );
}
