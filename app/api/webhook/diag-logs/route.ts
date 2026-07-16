export const runtime='edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const s=createAdminClient();
  const results:any={};
  // Total
  const r0 = await s.from("logs_actividad").select("*",{count:'exact',head:true});
  results.total = r0.count;
  results.total_err = r0.error?.message;
  // Últimos 20 por ocurrido_en (columna real)
  const r1 = await s.from("logs_actividad").select("evento,detalles,ocurrido_en").order("ocurrido_en",{ascending:false}).limit(20);
  results.ultimos_err = r1.error?.message;
  results.ultimos = (r1.data||[]).map((l:any)=>({
    evento: l.evento,
    ocurrido: l.ocurrido_en?.slice(0,19),
    detalles_sample: JSON.stringify(l.detalles||{}).slice(0,200),
  }));
  // Grouping por evento
  const r2 = await s.from("logs_actividad").select("evento");
  const eventos: Record<string,number> = {};
  for (const l of (r2.data||[])) eventos[l.evento] = (eventos[l.evento]||0)+1;
  results.por_evento = eventos;
  // misterplan específicos
  const r3 = await s.from("logs_actividad").select("evento,detalles,ocurrido_en")
    .like("evento", "misterplan_%").order("ocurrido_en",{ascending:false}).limit(5);
  results.misterplan_recent = (r3.data||[]).map((l:any)=>({
    evento: l.evento, ocurrido: l.ocurrido_en?.slice(0,19),
    detalles: l.detalles,
  }));
  return NextResponse.json(results);
}
