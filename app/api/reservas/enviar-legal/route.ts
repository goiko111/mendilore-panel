export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { filasDeLaReserva, textoHabitaciones } from "@/lib/reserva-grupo";


export async function POST(req: NextRequest) {
  const { reserva_id } = await req.json();
  if (!reserva_id) return NextResponse.json({ error: 'reserva_id requerido' }, { status: 400 });
  // La clave vive en Cloudflare Pages (RESEND_API_KEY). Antes estaba escrita
  // aquí y el repo es público: quemada, hay que rotarla en Resend.
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY no configurada' }, { status: 500 });

  const supabase = createAdminClient();
  const { data: reserva } = await supabase
    .from("reservas")
    .select("id, fecha_in, fecha_out, habitacion, huespedes(nombre, apellidos, email)")
    .eq("id", reserva_id)
    .single();

  if (!reserva) return NextResponse.json({ error: 'reserva no encontrada' }, { status: 404 });
  const h: any = reserva.huespedes;
  if (!h?.email) return NextResponse.json({ error: 'huésped sin email' }, { status: 400 });

  // Una sola firma para toda la reserva, aunque tenga varias habitaciones.
  const filas = await filasDeLaReserva(supabase, reserva_id);
  const habitaciones = textoHabitaciones(filas.length ? filas.map((f) => f.habitacion) : [reserva.habitacion]);
  const url = `https://panel.mendilore.com/aceptar/${reserva_id}`;
  const subject = "Casa Mendilore — confirma tus condiciones de estancia";
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#333;">
    <h2 style="color:#2d4f2d">Casa Mendilore · Hondarribia</h2>
    <p>Hola ${h.nombre ?? ''},</p>
    <p>Gracias por reservar con nosotros. Antes de tu llegada el <strong>${reserva.fecha_in}</strong> a ${habitaciones}, por favor confirma que aceptas nuestras condiciones de estancia (términos, política de cancelación y privacidad RGPD):</p>
    <p style="text-align:center;margin:30px 0">
      <a href="${url}" style="display:inline-block;background:#2d4f2d;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600">Revisar y aceptar condiciones</a>
    </p>
    <p style="font-size:13px;color:#666">Registro turístico Gobierno Vasco: XSS00159</p>
    <p style="font-size:13px;color:#666">Si tienes cualquier duda, escríbenos a info@mendilore.com.</p>
  </div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: "Casa Mendilore <reservas@mendilore.com>",
      to: [h.email],
      subject,
      html
    })
  });

  if (!r.ok) {
    const t = await r.text();
    return NextResponse.json({ error: `Resend: ${t}` }, { status: 500 });
  }

  await supabase.from("enlaces_legales_enviados").insert({
    reserva_id, huesped_email: h.email, metodo: 'email'
  });

  return NextResponse.json({ ok: true, enviado_a: h.email });
}
