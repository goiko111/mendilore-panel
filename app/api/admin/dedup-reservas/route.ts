export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createAdminClient();
  // Buscar duplicados: misma habitación, fecha_in, fecha_out, huesped_id
  const { data, error } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, importe_total, canal, estado_cobro, huesped_id, creado_en, actualizado_en")
    .order("habitacion")
    .order("fecha_in");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by key
  const groups = new Map<string, any[]>();
  (data ?? []).forEach((r: any) => {
    const key = `${r.habitacion}|${r.fecha_in}|${r.fecha_out}|${r.huesped_id}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  });

  const dups: any[] = [];
  groups.forEach((arr, key) => {
    if (arr.length > 1) dups.push({ key, count: arr.length, ids: arr.map(r => r.id), canales: arr.map(r => r.canal) });
  });

  return NextResponse.json({ totalReservas: data?.length || 0, duplicados: dups });
}

export async function POST(req: Request) {
  const { idsToDelete } = await req.json() as { idsToDelete: string[] };
  if (!idsToDelete || idsToDelete.length === 0) {
    return NextResponse.json({ error: "missing_ids" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("reservas").delete().in("id", idsToDelete);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: idsToDelete.length });
}
