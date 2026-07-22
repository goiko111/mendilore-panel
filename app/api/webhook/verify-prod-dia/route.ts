export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("secret") !== SECRET) return NextResponse.json({e:"x"}, {status:401});
  const s = createAdminClient();
  const desde = u.searchParams.get("desde") || "2026-07-01";
  const hasta = u.searchParams.get("hasta") || "2026-07-15";
  const { data, error } = await s.from("produccion_dia")
    .select("*").gte("dia", desde).lte("dia", hasta).order("dia");
  if (error) return NextResponse.json({ vista_ok: false, error: error.message, code: error.code });
  const total = (data||[]).reduce((a:any,r:any) => ({
    alojamiento: a.alojamiento + Number(r.ingresos_alojamiento||0),
    complementarios: a.complementarios + Number(r.ingresos_complementarios||0),
    total: a.total + Number(r.ingresos_total||0),
    noches: a.noches + Number(r.habitaciones_ocupadas||0),
  }), {alojamiento:0, complementarios:0, total:0, noches:0});
  return NextResponse.json({
    vista_ok: true,
    filas: data?.length || 0,
    totales: total,
    primeros_dias: data?.slice(0,7)
  });
}
