export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { year, month, ingresos_target, ocupacion_target_pct, noches_target, notas } = body;
  if (!year || !month) return NextResponse.json({ error: 'year + month requeridos' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from("objetivos_mensuales").upsert({
    year, month, ingresos_target, ocupacion_target_pct, noches_target, notas
  }, { onConflict: 'year,month' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
