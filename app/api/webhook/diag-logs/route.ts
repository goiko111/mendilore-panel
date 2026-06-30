export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("secret") !== SECRET) return NextResponse.json({error:"x"},{status:401});
  const s = createAdminClient();
  // logs sin filtro
  const { data: logs, error: e1 } = await s
    .from("logs_actividad")
    .select("evento,detalles,creado_en")
    .order("creado_en", { ascending: false })
    .limit(20);
  // eventos únicos
  const eventos = (logs||[]).reduce((acc:any, l:any) => { acc[l.evento]=(acc[l.evento]||0)+1; return acc; }, {});
  // listado de id_externo_misterplan + fechas
  const { data: ids } = await s
    .from("reservas")
    .select("id_externo_misterplan,fecha_in,canal,habitacion")
    .order("fecha_in", { ascending: true })
    .limit(50);
  return NextResponse.json({
    logsCount: logs?.length || 0,
    eventos,
    ultimosLogs: (logs||[]).slice(0,8).map((l:any) => ({
      evento: l.evento,
      creado: l.creado_en?.slice(0,19),
      detalles: l.detalles,
    })),
    reservasOrdenadas: ids,
    err: e1?.message
  });
}
