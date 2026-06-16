export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/aceptaciones — listado de aceptaciones registradas
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("aceptaciones_condiciones")
    .select("id, huesped_nombre_capturado, huesped_email_capturado, documento_tipo, documento_version, ip_cliente, metodo, aceptado_en")
    .order("aceptado_en", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ aceptaciones: data ?? [], total: data?.length ?? 0 });
}
