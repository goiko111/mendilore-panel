export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const s = createAdminClient();
  const { data, error } = await s
    .from("alertas_complementarios_fuera_estancia")
    .select("*")
    .limit(50);
  if (error) return NextResponse.json({ error: error.message, code: error.code, alertas: [] }, { headers: { "cache-control": "no-store" }});
  return NextResponse.json({
    total: data?.length || 0,
    alertas: data || []
  }, { headers: { "cache-control": "no-store" }});
}
