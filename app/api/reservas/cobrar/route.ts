export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { id, estado } = await req.json();
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  const nuevoEstado = estado || 'cobrado';
  if (!['cobrado', 'pendiente', 'fallido', 'reembolsado', 'no_aplica'].includes(nuevoEstado)) {
    return NextResponse.json({ error: 'estado_cobro inválido' }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("reservas").update({ estado_cobro: nuevoEstado }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id, estado_cobro: nuevoEstado });
}
