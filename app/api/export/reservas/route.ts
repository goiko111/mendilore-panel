/**
 * GET /api/export/reservas
 * --------------------------------------------------------------------------
 * CSV de reservas para Excel (contabilidad, subvenciones). Una fila por
 * habitación, como la pantalla Reservas, y con los MISMOS filtros que ella:
 *   t=todas|futuras|pasadas · q (nombre, apellidos o email) · habitacion ·
 *   estado_cobro · estado_reserva · canal · desde / hasta (fecha de entrada).
 * `from` / `to` se aceptan como sinónimos de desde / hasta (enlaces antiguos).
 *
 * Solo las 6 habitaciones. Separador `;`, BOM UTF-8 y coma decimal, para
 * que Excel en español lea los importes como números.
 */

import { createClient } from "@/lib/supabase/server";
import { HABITACIONES_VALIDAS, canalLabel } from "@/lib/constants";
import { hoyMadrid } from "@/lib/fechas";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const rowToCsv = (values: unknown[]) => values.map(csvEscape).join(";");

// 1131.3 → "1131,30"; vacío si no hay dato
function euros(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const sp = new URL(request.url).searchParams;
  const desde = sp.get("desde") || sp.get("from");
  const hasta = sp.get("hasta") || sp.get("to");
  const t = sp.get("t");
  const today = hoyMadrid();

  const filas: any[] = [];
  for (let i = 0; ; i += 1000) {
    let query = supabase
      .from("reservas")
      .select(`
        habitacion, fecha_in, fecha_out, noches,
        importe_alojamiento, importe_complementarios, importe_total, anticipo, pendiente_cobro,
        importe_moneda, estado_reserva, estado_cobro, canal, id_externo_misterplan, fecha_reserva,
        huespedes ( nombre, apellidos, email, telefono, pais )
      `)
      .in("habitacion", HABITACIONES_VALIDAS as unknown as string[])
      .order("fecha_in", { ascending: false })
      .order("id_externo_misterplan", { ascending: true })
      .order("habitacion", { ascending: true })
      .range(i, i + 999);
    if (t === "futuras") query = query.gte("fecha_in", today);
    if (t === "pasadas") query = query.lt("fecha_in", today);
    const habitacion = sp.get("habitacion");
    const estadoCobro = sp.get("estado_cobro");
    const estadoReserva = sp.get("estado_reserva");
    const canal = sp.get("canal");
    if (habitacion) query = query.eq("habitacion", habitacion);
    if (estadoCobro) query = query.eq("estado_cobro", estadoCobro);
    if (estadoReserva) query = query.eq("estado_reserva", estadoReserva);
    if (canal) query = query.eq("canal", canal);
    if (desde) query = query.gte("fecha_in", desde);
    if (hasta) query = query.lte("fecha_in", hasta);

    const { data, error } = await query;
    if (error) return new Response(`Error: ${error.message}`, { status: 500 });
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const q = sp.get("q")?.toLowerCase().trim();
  const reservas = q
    ? filas.filter((r) => {
        const h = r.huespedes ?? {};
        return `${h.nombre ?? ""} ${h.apellidos ?? ""} ${h.email ?? ""}`.toLowerCase().includes(q);
      })
    : filas;

  const rows: string[] = [rowToCsv([
    "Localizador MisterPlan",
    "Habitación",
    "Fecha entrada",
    "Fecha salida",
    "Noches",
    "Alojamiento",
    "Consumos",
    "Importe total",
    "Anticipo",
    "Pendiente de cobro",
    "Moneda",
    "Estado reserva",
    "Estado cobro",
    "Canal",
    "Fecha de reserva",
    "Huésped nombre",
    "Huésped apellidos",
    "Huésped email",
    "Huésped teléfono",
    "Huésped país"
  ])];

  for (const r of reservas) {
    const h = r.huespedes ?? {};
    rows.push(rowToCsv([
      r.id_externo_misterplan ?? "",
      r.habitacion,
      r.fecha_in,
      r.fecha_out,
      r.noches,
      euros(r.importe_alojamiento),
      euros(r.importe_complementarios),
      euros(r.importe_total),
      euros(r.anticipo),
      euros(r.pendiente_cobro),
      r.importe_moneda ?? "EUR",
      r.estado_reserva,
      r.estado_cobro,
      r.canal ? canalLabel(r.canal) : "",
      (r.fecha_reserva ?? "").toString().slice(0, 10),
      h.nombre ?? "",
      h.apellidos ?? "",
      h.email ?? "",
      h.telefono ?? "",
      h.pais ?? ""
    ]));
  }

  const body = "﻿" + rows.join("\r\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reservas-casa-mendilore-${today}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
