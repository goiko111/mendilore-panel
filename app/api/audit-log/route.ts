export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const entidad_id = url.searchParams.get("entidad_id");
  const entidad_tipo = url.searchParams.get("entidad_tipo") || "reserva";
  if (!entidad_id) return NextResponse.json({ error: 'entidad_id requerido' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, entidad_tipo, entidad_id, accion, cambios, usuario_email, creado_en")
    .eq("entidad_tipo", entidad_tipo)
    .eq("entidad_id", entidad_id)
    .order("creado_en", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, log: data });
}
