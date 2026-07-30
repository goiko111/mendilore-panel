export const runtime='edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const s=createAdminClient();
  const hoy = u.searchParams.get("fecha") || new Date().toISOString().slice(0,10);
  // Todas las reservas con fecha_in = hoy (sin filtros)
  const { data: todas } = await s.from("reservas")
    .select("id, id_externo_misterplan, habitacion, fecha_in, fecha_out, estado_reserva, estado_cobro, canal, huespedes(nombre, apellidos)")
    .eq("fecha_in", hoy);
  // Ocupadas hoy (para contexto)
  const { data: activas } = await s.from("reservas")
    .select("habitacion, fecha_in, fecha_out, estado_reserva, huespedes(nombre)")
    .lte("fecha_in", hoy).gt("fecha_out", hoy)
    .not("estado_reserva", "in", "(cancelada,no_show)");
  return NextResponse.json({ fecha: hoy, checkins_bd: todas, ocupadas_hoy: activas });
}
