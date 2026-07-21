export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createAdminClient();
  const alertas: string[] = [];

  let ultima_sync_mrplan: string | null = null;
  try {
    const { data: r } = await supabase
      .from("logs_actividad")
      .select("ocurrido_en")
      .in("evento", ["misterplan_sync_ok", "misterplan_sync_parcial"])
      .order("ocurrido_en", { ascending: false })
      .limit(1);
    ultima_sync_mrplan = r?.[0]?.ocurrido_en ?? null;
  } catch { alertas.push("No se pudo consultar el estado de MisterPlan."); }

  if (!ultima_sync_mrplan) {
    try {
      const { data: r } = await supabase
        .from("reservas")
        .select("fecha_reserva")
        .order("fecha_reserva", { ascending: false })
        .limit(1);
      ultima_sync_mrplan = r?.[0]?.fecha_reserva ?? null;
    } catch {}
  }

  let ultima_sync_competencia: string | null = null;
  try {
    const { data: r } = await supabase
      .from("precios_competidores_dia")
      .select("fecha_snapshot")
      .order("fecha_snapshot", { ascending: false })
      .limit(1);
    ultima_sync_competencia = r?.[0]?.fecha_snapshot ?? null;
  } catch { alertas.push("No se pudo consultar el estado de la captura de competencia."); }

  try {
    const { count } = await supabase
      .from("reservas")
      .select("id", { count: "exact", head: true })
      .not("habitacion", "in", "(cala,nube,margarita,lino,limonero,lavanda)");
    if ((count ?? 0) > 0) alertas.push(`Detectadas ${count} reservas con habitación "Alojamiento completo" o similar — filtradas de los cálculos.`);
  } catch {}

  return NextResponse.json(
    { ultima_sync_mrplan, ultima_sync_competencia, alertas },
    { headers: {
        "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
        "pragma": "no-cache",
      }}
  );
}
