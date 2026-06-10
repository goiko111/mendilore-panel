export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { id, completada } = await req.json();
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from("tareas")
    .update({ 
      estado: completada ? 'completada' : 'pendiente',
      completada_en: completada ? new Date().toISOString() : null
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
