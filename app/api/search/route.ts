export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const supabase = createAdminClient();

  const results: any[] = [];

  // Buscar huéspedes
  const { data: huespedes } = await supabase
    .from("huespedes")
    .select("id, nombre, apellidos, email, telefono")
    .or(`nombre.ilike.%${q}%,apellidos.ilike.%${q}%,email.ilike.%${q}%,telefono.ilike.%${q}%`)
    .limit(5);
  (huespedes ?? []).forEach((h: any) => {
    results.push({
      tipo: "huésped",
      emoji: "👤",
      titulo: `${h.nombre ?? ""} ${h.apellidos ?? ""}`.trim() || h.email || "—",
      subtitulo: h.email || h.telefono || "",
      href: `/huespedes/${h.id}`
    });
  });

  // Buscar reservas (por habitación, canal o relacionado huésped)
  const { data: reservas } = await supabase
    .from("reservas")
    .select("id, habitacion, fecha_in, fecha_out, importe_total, huespedes(nombre, apellidos)")
    .or(`habitacion.ilike.%${q}%,canal.ilike.%${q}%`)
    .limit(5);
  (reservas ?? []).forEach((r: any) => {
    const nom = r.huespedes ? `${r.huespedes.nombre ?? ""} ${r.huespedes.apellidos ?? ""}`.trim() : "—";
    results.push({
      tipo: "reserva",
      emoji: "📅",
      titulo: `${nom} · ${r.habitacion}`,
      subtitulo: `${r.fecha_in} → ${r.fecha_out} · ${r.importe_total}€`,
      href: `/reservas?id=${r.id}`
    });
  });

  // Buscar tareas
  try {
    const { data: tareas } = await supabase
      .from("tareas")
      .select("id, titulo, descripcion, estado")
      .ilike("titulo", `%${q}%`)
      .limit(5);
    (tareas ?? []).forEach((t: any) => {
      results.push({
        tipo: "tarea",
        emoji: "📋",
        titulo: t.titulo,
        subtitulo: t.descripcion ?? t.estado,
        href: "/tareas"
      });
    });
  } catch {}

  return NextResponse.json({ results: results.slice(0, 15) });
}
