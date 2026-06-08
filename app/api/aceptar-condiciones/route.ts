/**
 * POST /api/aceptar-condiciones
 * --------------------------------------------------------------------------
 * Endpoint PÚBLICO (sin auth de panel) que registra la aceptación de un huésped
 * a uno o más documentos legales. Cumple Fase 3 propuesta v4 sec 3.4.
 *
 * Captura:
 *   - identidad del huésped en el momento (nombre, email, documento opcional)
 *   - lista de documentos legales que acepta
 *   - reserva_id si está vinculada
 *   - IP del cliente (header CF-Connecting-IP / x-forwarded-for)
 *   - user-agent
 *   - URL de la página donde se aceptó (referrer)
 *   - timestamp UTC automático (DEFAULT now() en BD)
 *
 * Hash SHA-256 del documento se duplica en la fila por evidencia.
 *
 * Body esperado:
 *   {
 *     huesped_nombre: string,
 *     huesped_email?: string,
 *     huesped_documento?: string,
 *     reserva_id?: uuid,
 *     huesped_id?: uuid,
 *     documento_legal_ids: uuid[],
 *     metodo?: "checkbox_web" | "checkbox_email" | "pdf_firmado" | "voz" | "otro",
 *     url_pagina?: string
 *   }
 *
 * Respuesta:
 *   {
 *     ok: true,
 *     aceptaciones: [{ id, documento_tipo, documento_version, aceptado_en }]
 *   }
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type Body = {
  huesped_nombre?: string;
  huesped_email?: string;
  huesped_documento?: string;
  reserva_id?: string;
  huesped_id?: string;
  documento_legal_ids?: string[];
  metodo?: "checkbox_web" | "checkbox_email" | "pdf_firmado" | "voz" | "otro";
  url_pagina?: string;
};

function clientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "0.0.0.0";
  return "0.0.0.0";
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const nombre = (body.huesped_nombre ?? "").trim();
  const ids = Array.isArray(body.documento_legal_ids) ? body.documento_legal_ids : [];

  if (!nombre || nombre.length < 2) {
    return NextResponse.json({ ok: false, error: "huesped_nombre es obligatorio (mínimo 2 caracteres)" }, { status: 400 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "documento_legal_ids no puede estar vacío" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Cargar los documentos referenciados (necesitamos su tipo/version/hash actual)
  const { data: docs, error: errDocs } = await supabase
    .from("documentos_legales")
    .select("id, tipo, version, hash_sha256, vigente")
    .in("id", ids);

  if (errDocs || !docs) {
    return NextResponse.json({ ok: false, error: "No se pudieron cargar los documentos legales", details: errDocs?.message }, { status: 500 });
  }

  const docsNoVigentes = docs.filter((d) => !d.vigente).map((d) => d.id);
  if (docsNoVigentes.length > 0) {
    return NextResponse.json({ ok: false, error: "Algunos documentos no están vigentes", documentos_no_vigentes: docsNoVigentes }, { status: 400 });
  }
  if (docs.length !== ids.length) {
    return NextResponse.json({ ok: false, error: "Algún documento_legal_id no existe en BD" }, { status: 400 });
  }

  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") ?? null;
  const referer = body.url_pagina ?? request.headers.get("referer") ?? null;
  const metodo = body.metodo ?? "checkbox_web";

  // Insertar una fila por documento aceptado
  const rows = docs.map((d) => ({
    huesped_id: body.huesped_id ?? null,
    reserva_id: body.reserva_id ?? null,
    huesped_nombre_capturado: nombre,
    huesped_email_capturado: body.huesped_email ?? null,
    huesped_documento_capturado: body.huesped_documento ?? null,
    documento_legal_id: d.id,
    documento_tipo: d.tipo,
    documento_version: d.version,
    documento_hash_sha256: d.hash_sha256,
    ip_cliente: ip,
    user_agent: userAgent,
    url_pagina: referer,
    metodo
  }));

  const { data: inserted, error: errIns } = await supabase
    .from("aceptaciones_condiciones")
    .insert(rows)
    .select("id, documento_tipo, documento_version, aceptado_en");

  if (errIns) {
    return NextResponse.json({ ok: false, error: "No se pudieron registrar las aceptaciones", details: errIns.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    aceptaciones: inserted ?? [],
    ip,
    metodo
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/aceptar-condiciones",
    description: "Registra aceptación de uno o más documentos legales por un huésped (Fase 3)",
    body_required: ["huesped_nombre", "documento_legal_ids[]"],
    body_optional: ["huesped_email", "huesped_documento", "reserva_id", "huesped_id", "metodo", "url_pagina"]
  });
}
