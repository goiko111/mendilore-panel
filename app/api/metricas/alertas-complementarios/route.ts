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
  // Un consumo con fecha del DÍA DE SALIDA no es un error: es la comida o el
  // desayuno antes de irse. Solo se muestran las fechas realmente imposibles.
  const alertas = (data ?? []).filter((a: any) => a.fecha_complementario !== a.fecha_out);
  return NextResponse.json({
    total: alertas.length,
    alertas,
  }, { headers: { "cache-control": "no-store" }});
}
