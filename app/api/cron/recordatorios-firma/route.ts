/**
 * GET /api/cron/recordatorios-firma
 * --------------------------------------------------------------------------
 * Cron diario que revisa reservas pendientes de firma legal próximas al
 * check-in y envía un recordatorio AL HUÉSPED con el enlace de aceptación.
 *
 * Envíos a -7, -3 y -1 día del check-in (solo si tiene email).
 * Se persiste un registro en aceptaciones_recordatorios para no duplicar.
 *
 * Auth: header `x-cron-secret` debe coincidir con CRON_SECRET (env var).
 *
 * Fase 3 mejora 3/7 — Bloque 17 feedback Juan.
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

function htmlBody(huesped_nombre: string, dias: number, enlace: string, habitacion: string, fecha_in: string): string {
  const fechaFmt = new Date(fecha_in).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const tono = dias === 1 ? "mañana" : dias === 3 ? "en unos días" : "próximamente";
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafaf9;margin:0;padding:24px;">
<div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
  <div style="padding:24px;">
    <div style="color:#737373;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Casa Mendilore · Hondarribia</div>
    <h1 style="margin:0 0 16px;font-size:20px;color:#171717;">Hola ${huesped_nombre || "huésped"},</h1>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.55;">
      Te escribimos porque tu estancia en Casa Mendilore empieza <strong>${tono}</strong> — el <strong>${fechaFmt}</strong> en la habitación ${habitacion.charAt(0).toUpperCase()+habitacion.slice(1)}.
    </p>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.55;">
      Antes de tu llegada necesitamos que aceptes las <strong>condiciones particulares</strong> de la reserva (política de cancelación, normas de la casa y mascotas si aplica).
      Solo tienes que pulsar el botón de abajo y confirmar.
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
      Si tienes cualquier duda, contesta a este correo o llámanos.<br/>
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
  const today = new Date().toISOString().slice(0, 10);

  // Reservas pendientes de firma (vista creada en migration 0015)
  const { data: pendientes, error } = await supabase
    .from("reservas_pendientes_firma")
    .select("id, habitacion, fecha_in, huesped_nombre, huesped_email, dias_hasta_checkin")
    .in("dias_hasta_checkin", [7, 3, 1])
    .not("huesped_email", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reservas = (pendientes ?? []).filter((p: any) => p.huesped_email && p.huesped_email.includes("@"));
  if (reservas.length === 0) {
    return NextResponse.json({ ok: true, fecha: today, recordatorios_enviados: 0, motivo: "Sin pendientes a -7/-3/-1d" });
  }

  // Filtrar los que ya tienen recordatorio del mismo bucket (para no duplicar)
  const ids = reservas.map((r: any) => r.id);
  const { data: yaEnviados } = await supabase
    .from("aceptaciones_recordatorios")
    .select("reserva_id, dias_offset")
    .in("reserva_id", ids);

  const yaEnviadosSet = new Set<string>(
    (yaEnviados ?? []).map((x: any) => `${x.reserva_id}|${x.dias_offset}`)
  );

  const fromAddr = getFrom();
  let enviados = 0;
  let saltados = 0;
  const errores: any[] = [];

  for (const r of reservas) {
    const dias = Number(r.dias_hasta_checkin);
    const key = `${r.id}|${dias}`;
    if (yaEnviadosSet.has(key)) { saltados++; continue; }

    const enlace = `https://panel.mendilore.com/aceptar/${r.id}`;
    const subject = dias === 1
      ? `Tu estancia es mañana — Confirma las condiciones de tu reserva`
      : `Tu estancia se acerca — Confirma las condiciones (${dias} días)`;
    const html = htmlBody(r.huesped_nombre ?? "", dias, enlace, r.habitacion, r.fecha_in);

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromAddr,
        to: [r.huesped_email],
        subject,
        html,
      }),
    });

    if (resp.ok) {
      enviados++;
      // Marcar como enviado
      await supabase.from("aceptaciones_recordatorios").insert({
        reserva_id: r.id,
        dias_offset: dias,
        email_destino: r.huesped_email,
      });
    } else {
      const d = await resp.text();
      errores.push({ reserva_id: r.id, status: resp.status, body: d.slice(0, 240) });
    }
  }

  return NextResponse.json({
    ok: true,
    fecha: today,
    revisadas: reservas.length,
    enviados,
    saltados_ya_enviados: saltados,
    errores: errores.length,
    detalle_errores: errores.slice(0, 5),
  });
}
