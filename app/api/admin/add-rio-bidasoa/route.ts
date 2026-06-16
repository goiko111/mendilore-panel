export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createAdminClient();
  // Insertar Hotel Río Bidasoa (Sercotel) si no existe
  const { data: existing } = await supabase
    .from("competidores")
    .select("id, nombre")
    .ilike("nombre", "%bidasoa%")
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, already_exists: existing });
  }

  const { data, error } = await supabase
    .from("competidores")
    .insert({
      nombre: "Hotel Río Bidasoa",
      booking_url: "https://www.booking.com/hotel/es/rio-bidasoa-sercotel.html",
      estrellas: 3,
      activo: true
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, inserted: data });
}
