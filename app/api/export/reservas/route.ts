/**
 * GET /api/export/reservas[?from=YYYY-MM-DD&to=YYYY-MM-DD]
 * --------------------------------------------------------------------------
 * Genera CSV con el histórico de reservas (joinado con huésped y pagos).
 * Compatible Excel: separador `;` + BOM UTF-8 al inicio + comillas en celdas
 * con caracteres especiales. Cumple Fase 2 sec 3.3 (propuesta v4).
 *
 * Sin filtros => devuelve todas las reservas.
 * Con filtros => `?from=YYYY-MM-DD&to=YYYY-MM-DD` recorta por fecha_in.
 *
 * Edge runtime, sin dependencias externas.
 */

import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Si contiene separador, comillas o saltos de línea, envolvemos en comillas y duplicamos las comillas internas.
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToCsv(values: unknown[]): string {
  return values.map(csvEscape).join(";");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("reservas")
    .select(`
      id,
      habitacion,
      fecha_in,
      fecha_out,
      noches,
      importe_total,
      importe_moneda,
      estado_reserva,
      estado_cobro,
      canal,
      mister_plan_id,
      observaciones,
      creado_en,
      huespedes ( nombre, apellidos, email, telefono, pais, fuente )
    `)
    .order("fecha_in", { ascending: false });

  if (from) query = query.gte("fecha_in", from);
  if (to) query = query.lte("fecha_in", to);

  const { data: reservas, error } = await query;
  if (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }

  // Cabeceras
  const headers = [
    "ID",
    "Habitación",
    "Fecha entrada",
    "Fecha salida",
    "Noches",
    "Importe",
    "Moneda",
    "Estado reserva",
    "Estado cobro",
    "Canal",
    "MisterPlan ID",
    "Huésped nombre",
    "Huésped apellidos",
    "Huésped email",
    "Huésped teléfono",
    "Huésped país",
    "Fuente",
    "Observaciones",
    "Creado en"
  ];

  const rows: string[] = [];
  rows.push(rowToCsv(headers));

  for (const r of reservas ?? []) {
    const h: any = (r as any).huespedes ?? {};
    rows.push(rowToCsv([
      r.id,
      r.habitacion,
      r.fecha_in,
      r.fecha_out,
      r.noches,
      r.importe_total,
      r.importe_moneda,
      r.estado_reserva,
      r.estado_cobro,
      r.canal ?? "",
      r.mister_plan_id ?? "",
      h.nombre ?? "",
      h.apellidos ?? "",
      h.email ?? "",
      h.telefono ?? "",
      h.pais ?? "",
      h.fuente ?? "",
      r.observaciones ?? "",
      r.creado_en
    ]));
  }

  // BOM UTF-8 para que Excel detecte encoding correctamente
  const body = "﻿" + rows.join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `reservas-casa-mendilore-${today}.csv`;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store"
    }
  });
}
