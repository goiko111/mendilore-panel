export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/aceptaciones/[id]/evidencia
// Devuelve el dossier jurídico completo: documento firmado + IP + UA + timestamp + hash
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("evidencia_aceptacion", { p_aceptacion_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ev = data[0];
  const url = new URL(_req.url);
  if (url.searchParams.get("format") === "html") {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Evidencia jurídica · Aceptación ${ev.aceptacion_id}</title><style>body{font-family:system-ui,sans-serif;max-width:780px;margin:40px auto;padding:0 20px;color:#1a1a1a;}h1{font-size:20px;border-bottom:2px solid #047857;padding-bottom:8px;}h2{font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;margin-top:30px;}.k{color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;}.v{font-family:'Courier New',monospace;font-size:13px;background:#f3f4f6;padding:4px 8px;border-radius:4px;display:inline-block;margin:2px 0;}.doc{background:#f9fafb;border:1px solid #e5e7eb;padding:24px;border-radius:8px;margin-top:12px;white-space:pre-wrap;}@media print{body{margin:20px;}}</style></head><body><h1>📜 Evidencia jurídica · Aceptación de condiciones</h1><p>Documento probatorio reconstruible de la aceptación de condiciones por parte del huésped. Esta evidencia es válida ante reclamaciones, disputas o procedimientos de cobro.</p><h2>Identificación de la aceptación</h2><table><tr><td class="k">ID aceptación</td></tr><tr><td><span class="v">${ev.aceptacion_id}</span></td></tr><tr><td class="k">Reserva vinculada</td></tr><tr><td><span class="v">${ev.reserva_id ?? '—'}</span></td></tr><tr><td class="k">Huésped</td></tr><tr><td>${ev.huesped_nombre}${ev.huesped_email ? ' · ' + ev.huesped_email : ''}</td></tr></table><h2>Documento firmado</h2><table><tr><td class="k">Tipo</td><td>${ev.documento_tipo}</td></tr><tr><td class="k">Título</td><td>${ev.documento_titulo}</td></tr><tr><td class="k">Versión</td><td><span class="v">${ev.documento_version}</span></td></tr><tr><td class="k">Hash SHA-256</td><td><span class="v">${ev.documento_hash}</span></td></tr></table><h2>Contexto técnico (validez jurídica)</h2><table><tr><td class="k">Aceptado en</td><td>${ev.aceptado_en} UTC</td></tr><tr><td class="k">IP cliente</td><td><span class="v">${ev.ip_cliente}</span></td></tr><tr><td class="k">User Agent</td><td><span class="v">${ev.user_agent ?? '—'}</span></td></tr><tr><td class="k">URL página</td><td><span class="v">${ev.url_pagina ?? '—'}</span></td></tr><tr><td class="k">Método</td><td>${ev.metodo}</td></tr></table><h2>Contenido íntegro del documento firmado</h2><div class="doc">${(ev.documento_contenido || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div><p style="margin-top:30px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:10px;">Casa Mendilore · Hondarribia · Conservación 6 años por plazo mercantil · Documento generado automáticamente · ${new Date().toISOString()}</p></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json(ev);
}
