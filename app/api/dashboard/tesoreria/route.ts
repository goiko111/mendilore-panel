export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const s = createAdminClient();

  const { data: resumen, error: e1 } = await s
    .from("resumen_tesoreria")
    .select("*");

  if (e1) {
    return NextResponse.json(
      { error: e1.message, hint: "Aplicar migration 0029 en Supabase", resumen: [], detalle: [] },
      { headers: { "cache-control": "no-store" } }
    );
  }

  // Detalle de las que requieren acción + las prepago próximas (para tesorería)
  const hoy = new Date().toISOString().slice(0, 10);
  const { data: detalle } = await s
    .from("clasificacion_cobros")
    .select("id, huesped, habitacion, fecha_in, fecha_out, canal, importe_total, ya_cobrado, por_cobrar, clasificacion, descripcion")
    .gte("fecha_out", hoy)
    .in("clasificacion", ["pendiente_gestion", "prepago_ota", "anticipo_web"])
    .order("fecha_in", { ascending: true })
    .limit(100);

  const orden: Record<string, number> = {
    pendiente_gestion: 1, anticipo_web: 2, prepago_ota: 3, cobrado: 4,
  };
  const resumenOrdenado = (resumen || []).sort(
    (a: any, b: any) => (orden[a.clasificacion] ?? 9) - (orden[b.clasificacion] ?? 9)
  );

  return NextResponse.json(
    { resumen: resumenOrdenado, detalle: detalle || [] },
    { headers: { "cache-control": "no-store" } }
  );
}
