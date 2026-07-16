export const runtime='edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const s=createAdminClient();
  // Contar todas las filas sin filtro (incluye columna created_at vs creado_en)
  const results: any = {};
  // Prueba con creado_en
  const r1 = await s.from("logs_actividad").select("evento,creado_en").order("creado_en",{ascending:false}).limit(3);
  results.creado_en_ok = !r1.error;
  results.creado_en_err = r1.error?.message;
  results.creado_en_rows = r1.data;
  // Prueba con created_at
  const r2 = await s.from("logs_actividad").select("evento,created_at").order("created_at",{ascending:false}).limit(3).select();
  results.created_at_ok = !r2.error;
  results.created_at_err = r2.error?.message;
  results.created_at_rows = r2.data;
  // Prueba insert manual
  const testEvento = "test_diag_" + Date.now();
  const r3 = await s.from("logs_actividad").insert({ evento: testEvento, detalles: { source: "diag-logs-v2" }}).select();
  results.insert_ok = !r3.error;
  results.insert_err = r3.error?.message;
  results.insert_data = r3.data;
  // Contar todas
  const r4 = await s.from("logs_actividad").select("*", { count: 'exact', head: true });
  results.total_count = r4.count;
  return NextResponse.json(results);
}
