export const runtime='edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const s=createAdminClient();
  const results:any={};
  // 1) simple select all sin orden
  try {
    const r = await s.from("logs_actividad").select("*").limit(5);
    results.simple_select = { count: r.data?.length, err: r.error?.message, code: r.error?.code, sample: r.data?.[0] };
  } catch(e:any) { results.simple_select_exception = e.message; }
  // 2) select con count
  try {
    const r = await s.from("logs_actividad").select("id",{count:'exact'}).limit(1);
    results.count_check = { totalCount: r.count, err: r.error?.message };
  } catch(e:any) { results.count_check_exception = e.message; }
  // 3) INSERT prueba
  try {
    const r = await s.from("logs_actividad").insert({
      evento: "diag_probe_" + Date.now(),
      detalles: { source: "diag-logs-v3" }
    }).select();
    results.insert_check = { err: r.error?.message, code: r.error?.code, ok: !r.error, data: r.data };
  } catch(e:any) { results.insert_exception = e.message; }
  // 4) Después del insert, contar
  try {
    const r = await s.from("logs_actividad").select("*",{count:'exact'}).like("evento","diag_probe_%");
    results.probes_count = r.count;
  } catch(e:any) { results.probes_count_exception = e.message; }
  // 5) Existe la tabla en information_schema?
  try {
    const r = await s.rpc("get_current_setting", { setting_name: "search_path"});
    results.search_path = { data: r.data, err: r.error?.message };
  } catch(e:any) { results.search_path_exception = e.message; }
  return NextResponse.json(results);
}
