export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as { habitacion: string; tipo: 'sabanas' | 'toallas'; reserva_id?: string };
  if (!body.habitacion || !body.tipo) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("housekeeping_cambios")
    .insert({
      habitacion: body.habitacion,
      tipo: body.tipo,
      reserva_id: body.reserva_id ?? null,
      cambiado_por: user.email ?? null
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, registro: data });
}
