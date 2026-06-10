export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, dni, pasaporte, fecha_nacimiento, nacionalidad, notas_privadas } = body;
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  const supabase = createAdminClient();
  const update: any = {};
  if (dni !== undefined) update.dni = dni;
  if (pasaporte !== undefined) update.pasaporte = pasaporte;
  if (fecha_nacimiento !== undefined) update.fecha_nacimiento = fecha_nacimiento || null;
  if (nacionalidad !== undefined) update.nacionalidad = nacionalidad;
  if (notas_privadas !== undefined) update.notas_privadas = notas_privadas;
  const { error } = await supabase.from("huespedes").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
