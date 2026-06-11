export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createAdminClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 86400_000).toISOString().slice(0, 10);

  // Query 1: Marjan exact
  const { data: m } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, estado_cobro, estado_reserva, huesped_id, huespedes(nombre, apellidos)")
    .order("fecha_in")
    .limit(20);

  // Query 2: con la nueva query gte/lt
  const { data: q1, count: c1 } = await supabase
    .from("reservas")
    .select("id, fecha_in, estado_cobro", { count: "exact" })
    .gte("fecha_in", todayStr)
    .lt("fecha_in", tomorrow)
    .neq("estado_cobro", "cancelado");

  // Query 3: eq directo
  const { data: q2, count: c2 } = await supabase
    .from("reservas")
    .select("id, fecha_in, estado_cobro", { count: "exact" })
    .eq("fecha_in", todayStr);

  return NextResponse.json({
    today: todayStr,
    tomorrow,
    allReservas: m,
    queryGteLt: { count: c1, rows: q1 },
    queryEq: { count: c2, rows: q2 }
  });
}
