export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// TEMPORAL · diagnóstico. Borrar al cerrar el proyecto.
const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("secret") !== SECRET) return NextResponse.json({ e: "x" }, { status: 401 });
  const q = (u.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ error: "falta ?q=nombre" }, { status: 400 });

  const s = createAdminClient();

  const { data: huespedes } = await s.from("huespedes")
    .select("id,nombre,apellidos,email")
    .or(`nombre.ilike.%${q}%,apellidos.ilike.%${q}%`)
    .limit(20);

  const ids = (huespedes ?? []).map((h: any) => h.id);
  if (ids.length === 0) return NextResponse.json({ q, huespedes: [], reservas: [] });

  const { data: reservas } = await s.from("reservas")
    .select("id,id_externo_misterplan,habitacion,fecha_in,fecha_out,noches,canal,importe_alojamiento,importe_complementarios,importe_total,anticipo,pendiente_cobro,estado_cobro,estado_reserva,huesped_id,actualizado_en")
    .in("huesped_id", ids)
    .order("fecha_in", { ascending: false })
    .limit(60);

  // Agrupar por reserva de MisterPlan para ver las multi-habitación de un vistazo
  const porReserva = new Map<string, any>();
  for (const r of reservas ?? []) {
    const k = r.id_externo_misterplan as string;
    const g = porReserva.get(k) ?? { id_externo: k, habitaciones: [], total: 0, fecha_in: r.fecha_in, fecha_out: r.fecha_out };
    g.habitaciones.push({
      habitacion: r.habitacion,
      alojamiento: r.importe_alojamiento,
      complementarios: r.importe_complementarios,
      total: r.importe_total,
      estado_cobro: r.estado_cobro,
      actualizado_en: r.actualizado_en,
    });
    g.total = Math.round((g.total + Number(r.importe_total || 0)) * 100) / 100;
    porReserva.set(k, g);
  }

  const nombre = new Map((huespedes ?? []).map((h: any) => [h.id, `${h.nombre} ${h.apellidos ?? ""}`.trim()]));

  return NextResponse.json({
    q,
    huespedes: (huespedes ?? []).map((h: any) => ({ nombre: nombre.get(h.id), email: h.email })),
    reservas_agrupadas: Array.from(porReserva.values()),
  });
}
