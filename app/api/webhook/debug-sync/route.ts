export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("secret") !== SECRET) return NextResponse.json({e:"x"}, {status:401});
  const s = createAdminClient();
  const result: any = { steps: [] };

  // Test 1: log misterplan_sync_ok
  try {
    const r = await s.from("logs_actividad").select("evento,ocurrido_en")
      .in("evento", ["misterplan_sync_ok","misterplan_sync_parcial"])
      .order("ocurrido_en", { ascending: false }).limit(3);
    result.steps.push({ name: "logs misterplan_sync_*", err: r.error?.message, count: r.data?.length, first: r.data?.[0] });
  } catch (e:any) { result.steps.push({ name: "logs misterplan_sync_*", exception: e.message }); }

  // Test 2: eventos que EXISTEN con misterplan
  try {
    const r = await s.from("logs_actividad").select("evento")
      .like("evento", "misterplan%").limit(10);
    result.steps.push({ name: "eventos misterplan*", data: [...new Set((r.data||[]).map((x:any)=>x.evento))] });
  } catch (e:any) { result.steps.push({ name: "eventos misterplan*", exception: e.message }); }

  // Test 3: reservas.fecha_reserva fallback
  try {
    const r = await s.from("reservas").select("fecha_reserva")
      .order("fecha_reserva", { ascending: false }).limit(1);
    result.steps.push({ name: "reservas.fecha_reserva fallback", err: r.error?.message, first: r.data?.[0] });
  } catch (e:any) { result.steps.push({ name: "reservas.fecha_reserva", exception: e.message }); }

  // Test 4: sync-status endpoint invoke directo con service_role
  try {
    const { data: mp } = await s.from("logs_actividad").select("ocurrido_en")
      .in("evento", ["misterplan_sync_ok","misterplan_sync_parcial"])
      .order("ocurrido_en", { ascending: false }).limit(1);
    result.ultima_sync_mrplan_calc = mp?.[0]?.ocurrido_en ?? null;
  } catch (e:any) { result.calc_error = e.message; }
  return NextResponse.json(result);
}
