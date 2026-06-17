/**
 * GET /api/cron/auto-envio-legal
 * --------------------------------------------------------------------------
 * Cron que se dispara con frecuencia (cada 30 min o 1 h) y envía
 * automáticamente el enlace de aceptación de condiciones a CADA reserva
 * nueva que cumpla:
 *   · creada en las últimas 48 h
 *   · estado_reserva != 'cancelada' && != 'no_show'
 *   · check-in >= hoy
 *   · huésped con email válido
 *   · sin envío previo (legal_enviado_en IS NULL)
 *   · sin aceptación firmada
 *
 * Cumple Fase 3 mejora 7/7 — Bloque 17 feedback Juan: "que el legal se envíe
 * automáticamente al crear la reserva, no que tenga que pulsar yo manualmente".
 *
 * Auth: header `x-cron-secret`.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const FROM_FALLBACK = "Casa Mendilore <onboarding@resend.dev>";
const FROM_PRODUCCION = "Casa Mendilore <noreply@mendilore.com>";

function getFrom() {
  return process.env.RESEND_DOMAIN_VERIFICADO === "true" ? FROM_PRODUCCION : FROM_FALLBACK;
}

function htmlBody(huesped_nombre: string, habitacion: string, fecha_in: string, enlace: string): string {
  const fechaFmt = new Date(fecha_in).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafaf9;margin:0;padding:24px;">
<div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
  <div style="padding:24px;">
    <div style="color:#737373;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Casa Mendilore · Hondarribia</div>
    <h1 style="margin:0 0 16px;font-size:20px;color:#171717;">Hola ${huesped_nombre || "huésped"},</h1>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.55;">
      Te damos la bienvenida y te confirmamos tu reserva en Casa Mendilore para el <strong>${fechaFmt}</strong> en la habitación ${habitacion.charAt(0).toUpperCase()+habitacion.slice(1)}.
    </p>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.55;">
      Para completar tu reserva, necesitamos que aceptes nuestras <strong>condiciones particulares</strong>:
      política de cancelación, normas de la casa y política de mascotas si viaja contigo alguna. Solo te llevará un minuto.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${enlace}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;font-size:15px;">
        Aceptar condiciones de mi reserva
      </a>
    </div>
    <p style="margin:0;color:#737373;font-size:13px;line-height:1.5;">
      Si el botón no funciona, copia este enlace en tu navegador: <br/>
      <span style="color:#0f766e;word-break:break-all;">${enlace}</span>
    </p>
    <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid #e5e5e5;color:#737373;font-size:12px;line-height:1.4;">
      Si tienes cualquier duda, contesta a este correo.<br/>
      Gracias y nos vemos pronto en Hondarribia.<br/>
      <strong>Casa Mendilore</strong>
    </p>
  </div>
</div>
</body></html>`;
}

export async function GET(req: Request) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });

  const supabase = createAdminClient();
  const ahora = new Date();
  const hace48h = new Date(ahora.getTime() - 48 * 3600_000).toISOString();
  const today = ahora.toISOString().slice(0, 10);

  // Buscar reservas candidatas
  const { data: nuevas, error } = await supabase
    .from("reservas")
    .select(`
      id, habitacion, fecha_in, estado_reserva,
      huesped:huespedes ( nombre, apellidos, email )
    `)
    .gte("created_at", hace48h)
    .gte("fecha_in", today)
    .is("legal_enviado_en", null)
    .not("estado_reserva", "in", "(cancelada,no_show)");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!nuevas || nuevas.length === 0) {
    return NextResponse.json({ ok: true, fecha: today, candidatas: 0, motivo: "Sin nuevas en últimas 48h" });
  }

  // Filtrar las que ya tienen aceptación firmada
  const ids = nuevas.map((r: any) => r.id);
  const { data: yaFirmadas } = await supabase
    .from("aceptaciones_condiciones")
    .select("reserva_id")
    .in("reserva_id", ids);
  const firmadasSet = new Set<string>((yaFirmadas ?? []).map((a: any) => a.reserva_id));

  const fromAddr = getFrom();
  let enviados = 0;
  let saltados_firmada = 0;
  let saltados_sin_email = 0;
  const errores: any[] = [];

  for (const r of nuevas as any[]) {
    if (firmadasSet.has(r.id)) { saltados_firmada++; continue; }
    const huesped = Array.isArray(r.huesped) ? r.huesped[0] : r.huesped;
    const email = huesped?.email;
    if (!email || !email.includes("@") || email.endsWith("@guest.booking.com")) {
      saltados_sin_email++;
      continue;
    }
    const nombre = huesped?.nombre ?? "";
    const enlace = `https://panel.mendilore.com/aceptar/${r.id}`;
    const subject = `Confirmación de tu reserva en Casa Mendilore — aceptación de condiciones`;
    const html = htmlBody(nombre, r.habitacion, r.fecha_in, enlace);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [email],
        subject,
        html,
      }),
    });

    if (resp.ok) {
      enviados++;
      await supabase
        .from("reservas")
        .update({ legal_enviado_en: ahora.toISOString() })
        .eq("id", r.id);
    } else {
      const d = await resp.text();
      errores.push({ reserva_id: r.id, status: resp.status, body: d.slice(0, 240) });
    }
  }

  return NextResponse.json({
    ok: true,
    fecha: today,
    candidatas: nuevas.length,
    enviados,
    saltados_ya_firmada: saltados_firmada,
    saltados_sin_email_util: saltados_sin_email,
    errores: errores.length,
    detalle_errores: errores.slice(0, 5),
  });
}
