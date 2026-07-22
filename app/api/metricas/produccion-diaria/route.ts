export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const desde = u.searchParams.get("desde");
  const hasta = u.searchParams.get("hasta");
  if (!desde || !hasta) return NextResponse.json({ error: "desde y hasta requeridos (YYYY-MM-DD)" }, { status: 400 });

  const s = createAdminClient();
  const { data, error } = await s
    .from("produccion_dia")
    .select("dia, habitaciones_ocupadas, ingresos_alojamiento, ingresos_complementarios, ingresos_total")
    .gte("dia", desde)
    .lte("dia", hasta)
    .order("dia", { ascending: true });

  if (error) return NextResponse.json({ error: error.message, hint: "Aplicar migration 0021 en Supabase" }, { status: 500 });

  const total = (data || []).reduce((acc: any, r: any) => ({
    alojamiento: acc.alojamiento + Number(r.ingresos_alojamiento || 0),
    complementarios: acc.complementarios + Number(r.ingresos_complementarios || 0),
    total: acc.total + Number(r.ingresos_total || 0),
    habitaciones: acc.habitaciones + Number(r.habitaciones_ocupadas || 0),
  }), { alojamiento: 0, complementarios: 0, total: 0, habitaciones: 0 });

  return NextResponse.json({
    desde, hasta,
    dias: data || [],
    totales: total,
    nota: "Alojamiento y complementarios repartidos linealmente entre las noches de estancia de cada reserva — corrige el bug del informe agregado de MrPlan"
  }, { headers: { "cache-control": "no-store" }});
}
