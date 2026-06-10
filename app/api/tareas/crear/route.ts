export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.titulo?.trim()) return NextResponse.json({ error: 'titulo requerido' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tareas").insert({
    titulo: body.titulo.trim(),
    descripcion: body.descripcion || null,
    fecha_limite: body.fecha_limite || null,
    prioridad: body.prioridad || 'normal',
    asignado_a: body.asignado_a || null
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tarea: data });
}
