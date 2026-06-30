export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("secret") !== SECRET) return NextResponse.json({error:"x"},{status:401});
  const s = createAdminClient();
  // Reservas por mes (extract anio-mes de fecha_in)
  const { data: reservas, error: e1 } = await s
    .from("reservas")
    .select("fecha_in,habitacion,estado_reserva,canal,importe_total,id_externo_misterplan")
    .order("fecha_in", { ascending: false })
    .limit(500);
  // Conteo por mes
  const porMes: Record<string, number> = {};
  const porHab: Record<string, number> = {};
  const porCanal: Record<string, number> = {};
  for (const r of reservas || []) {
    const mes = (r.fecha_in || "").slice(0,7);
    porMes[mes] = (porMes[mes]||0)+1;
    porHab[r.habitacion||"?"] = (porHab[r.habitacion||"?"]||0)+1;
    porCanal[r.canal||"?"] = (porCanal[r.canal||"?"]||0)+1;
  }
  // Últimos 5 logs misterplan
  const { data: logs } = await s
    .from("logs_actividad")
    .select("evento,detalles,creado_en")
    .like("evento", "misterplan_%")
    .order("creado_en", { ascending: false })
    .limit(5);
  // ocupacion_mes
  const { data: ocup, error: e3 } = await s
    .from("ocupacion_mes")
    .select("*")
    .limit(50);
  return NextResponse.json({
    totalReservas: reservas?.length || 0,
    porMes,
    porHab,
    porCanal,
    ultimosLogs: logs,
    ocupacionMes: { count: ocup?.length || 0, items: ocup },
    errores: { reservas: e1?.message, ocupacion: e3?.message },
  });
}
