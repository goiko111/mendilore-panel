export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createAdminClient();
  const out: any = {};
  try {
    const { data: c, error: ec } = await supabase
      .from("competidores")
      .select("id, nombre, booking_url, estrellas, activo")
      .limit(10);
    out.competidores = { ok: !ec, error: ec?.message, count: c?.length, sample: c?.slice(0, 2) };
  } catch (e: any) { out.competidores = { exception: String(e) }; }

  try {
    const { data: s, error: es } = await supabase
      .from("precios_competidores_dia")
      .select("competidor_id, fecha_snapshot, check_in, precio_total, precio_por_noche, moneda, disponible, rating, rating_label, reviews_count")
      .limit(5);
    out.snapshots = { ok: !es, error: es?.message, count: s?.length, sample: s?.slice(0, 2) };
  } catch (e: any) { out.snapshots = { exception: String(e) }; }

  return NextResponse.json(out);
}
