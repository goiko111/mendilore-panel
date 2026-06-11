export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ga4_tokens")
    .select("google_email,scope,property_id,expires_at,creado_en,actualizado_en")
    .limit(5);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tokens: data, count: data?.length || 0 });
}

export async function DELETE() {
  const supabase = createAdminClient();
  const { error } = await supabase.from("ga4_tokens").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: "Todos los tokens GA4 borrados. Reconecta para forzar nuevo consent con scope analytics.readonly." });
}
