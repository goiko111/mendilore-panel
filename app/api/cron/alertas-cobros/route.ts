/**
 * GET /api/cron/alertas-cobros
 * --------------------------------------------------------------------------
 * Cron diario que revisa reservas pendientes de cobro próximas al check-in
 * y envía email de alerta a info@mendilore.com Y mendilore@mendilore.com.
 *
 * Disparado por pg_cron diariamente (ver migration 0006).
 *
 * Auth: header `x-cron-secret` debe coincidir con CRON_SECRET (env var).
 *
 * Envío vía Resend (https://resend.com): API key gratuita 3.000 emails/mes.
 * Configurar:
 *   1. Crear cuenta en resend.com con info@mendilore.com
 *   2. Obtener API key
 *   3. Añadir como env var RESEND_API_KEY en CF Pages
 *   4. (Opcional) verificar dominio mendilore.com para enviar desde noreply@mendilore.com
 *      Si no, se envía desde onboarding@resend.dev (válido pero menos serio)
 *
 * Cumple Fase 2 sec 3.3 propuesta v4: "Alertas operativas mínimas: alerta cuando
 * una reserva sigue sin cobrar a 13 días del check-in, alerta cuando falla el
 * pipeline de MisterPlan. Notificación por email."
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Resend free sin dominio verificado solo permite enviar al email owner de la cuenta.
 * Cuando se verifique el dominio mendilore.com en Resend (RESEND_DOMAIN_VERIFICADO=true),
 * usaremos ambos destinatarios y envío desde noreply@mendilore.com.
 */
const DESTINATARIOS_VERIFICADO = ["info@mendilore.com", "mendilore@mendilore.com"];
const DESTINATARIOS_FREE = ["info@mendilore.com"];  // owner de la cuenta Resend
const FROM_FALLBACK = "Casa Mendilore <onboarding@resend.dev>";
const FROM_PRODUCCION = "Casa Mendilore <noreply@mendilore.com>";

const DESTINATARIOS = process.env.RESEND_DOMAIN_VERIFICADO === "true"
  ? DESTINATARIOS_VERIFICADO
  : DESTINATARIOS_FREE;

type ReservaAlerta = {
  id: string;
  habitacion: string;
  fecha_in: string;
  importe_total: number;
  importe_moneda: string;
  canal: string | null;
  huespedes: { nombre: string; apellidos: string | null; email: string | null; telefono: string | null } | null;
};

function diasHasta(fecha: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(fecha);
  target.setUTCHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400_000);
}

function urgenciaLabel(dias: number): { label: string; color: string } {
  if (dias < 0) return { label: `vencido hace ${-dias} día${-dias === 1 ? "" : "s"}`, color: "#b91c1c" };
  if (dias === 0) return { label: "HOY (check-in)", color: "#b91c1c" };
  if (dias <= 3) return { label: `en ${dias} día${dias === 1 ? "" : "s"}`, color: "#c2410c" };
  if (dias <= 7) return { label: `en ${dias} días`, color: "#b45309" };
  return { label: `en ${dias} días`, color: "#525252" };
}

function htmlEmail(reservas: ReservaAlerta[], totalImporte: number, moneda: string): string {
  const filas = reservas
    .sort((a, b) => a.fecha_in.localeCompare(b.fecha_in))
    .map((r) => {
      const dias = diasHasta(r.fecha_in);
      const u = urgenciaLabel(dias);
      const nombre = r.huespedes ? `${r.huespedes.nombre} ${r.huespedes.apellidos ?? ""}`.trim() : "—";
      const contacto = r.huespedes?.telefono ?? r.huespedes?.email ?? "—";
      const fechaFmt = new Date(r.fecha_in).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
      return `<tr>
  <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;">${nombre}<br/><span style="color:#737373;font-size:12px;">${contacto}</span></td>
  <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-transform:capitalize;">${r.habitacion}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;">${fechaFmt}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;color:${u.color};font-weight:600;">${u.label}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;text-align:right;font-weight:600;">${Number(r.importe_total).toFixed(2)} ${r.importe_moneda}</td>
  <td style="padding:10px 8px;border-bottom:1px solid #e5e5e5;color:#737373;">${r.canal ?? "—"}</td>
</tr>`;
    })
    .join("");

  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafaf9;margin:0;padding:24px;">
<div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
  <div style="padding:20px 24px;border-bottom:1px solid #e5e5e5;">
    <div style="color:#737373;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Casa Mendilore · Alerta operativa</div>
    <h1 style="margin:0;font-size:20px;color:#171717;">Cobros pendientes próximos al check-in</h1>
    <p style="margin:8px 0 0;color:#525252;font-size:14px;">
      ${reservas.length} reserva${reservas.length === 1 ? "" : "s"} con entrada en los próximos 14 días sin cobrar · total <strong>${totalImporte.toFixed(2)} ${moneda}</strong>
    </p>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="background:#fafaf9;color:#737373;text-align:left;">
      <th style="padding:8px;font-weight:500;">Huésped</th>
      <th style="padding:8px;font-weight:500;">Habitación</th>
      <th style="padding:8px;font-weight:500;">Check-in</th>
      <th style="padding:8px;font-weight:500;">Días</th>
      <th style="padding:8px;font-weight:500;text-align:right;">Importe</th>
      <th style="padding:8px;font-weight:500;">Canal</th>
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>
  <div style="padding:16px 24px;background:#fafaf9;border-top:1px solid #e5e5e5;font-size:12px;color:#737373;">
    Detalle completo en <a href="https://panel.mendilore.com/dashboard" style="color:#1f7a5a;">panel.mendilore.com</a>.<br/>
    Esta alerta se envía cada día a las 09:00 (Madrid) si hay cobros pendientes próximos al check-in.
  </div>
</div>
</body></html>`;
}

async function enviarEmail(subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY no configurada" };

  const dominioVerificado = process.env.RESEND_DOMAIN_VERIFICADO === "true";
  const from = dominioVerificado ? FROM_PRODUCCION : FROM_FALLBACK;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: DESTINATARIOS, subject, html })
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${t.slice(0, 200)}` };
  }
  return { ok: true };
}

export async function GET(request: Request) {
  // Auth: header secret
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const in14Days = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);

  const { data: reservas, error } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, importe_total, importe_moneda, canal, huespedes(nombre, apellidos, email, telefono)")
    .eq("estado_cobro", "pendiente")
    .in("estado_reserva", ["confirmada", "completada"])
    .gte("fecha_in", today)
    .lte("fecha_in", in14Days)
    .order("fecha_in", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Log de la ejecución
  await supabase.from("logs_actividad").insert({
    evento: "cron_alertas_cobros_ejecutado",
    detalles: { reservas_encontradas: reservas?.length ?? 0, fecha: today }
  });

  if (!reservas || reservas.length === 0) {
    return NextResponse.json({ ok: true, message: "Sin cobros pendientes próximos. Email no enviado.", encontrados: 0 });
  }

  const total = reservas.reduce((acc: number, r: any) => acc + Number(r.importe_total || 0), 0);
  const moneda = (reservas[0] as any).importe_moneda ?? "EUR";

  const dias_minimos = Math.min(...reservas.map((r: any) => diasHasta(r.fecha_in)));
  let prefijo = "Cobros pendientes";
  if (dias_minimos < 0) prefijo = "🔴 URGENTE — Cobros vencidos sin cobrar";
  else if (dias_minimos <= 3) prefijo = "🔴 Cobros pendientes — check-in inmediato";
  else if (dias_minimos <= 7) prefijo = "🟠 Cobros pendientes — esta semana";

  const subject = `${prefijo} · ${reservas.length} reservas · ${total.toFixed(2)} ${moneda}`;
  const html = htmlEmail(reservas as any, total, moneda);

  const envio = await enviarEmail(subject, html);

  // Log resultado
  await supabase.from("logs_actividad").insert({
    evento: envio.ok ? "alerta_cobros_email_enviado" : "alerta_cobros_email_fallido",
    detalles: {
      destinatarios: DESTINATARIOS,
      reservas_encontradas: reservas.length,
      total_importe: total,
      subject,
      error: envio.error
    }
  });

  return NextResponse.json({
    ok: envio.ok,
    encontrados: reservas.length,
    total,
    moneda,
    destinatarios: DESTINATARIOS,
    error: envio.error
  });
}

// POST para llamadas desde pg_cron via pg_net (extensiones Supabase)
export async function POST(request: Request) {
  return GET(request);
}
