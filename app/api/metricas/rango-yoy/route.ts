export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const HABITACIONES = ["cala","nube","margarita","lino","limonero","lavanda"];

async function metricsForRange(supabase: any, desdeISO: string, hastaISO: string) {
  // Reservas activas (check-in dentro del rango, excluidas canceladas/no-show/alojamiento completo)
  const { data, error } = await supabase
    .from("reservas")
    .select("id, fecha_in, fecha_out, noches, habitacion, importe_total, importe_alojamiento, importe_complementarios, estado_reserva, canal")
    .gte("fecha_in", desdeISO)
    .lte("fecha_in", hastaISO)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABITACIONES);
  if (error) throw error;

  const list = data || [];
  const num = list.length;
  const ingresos_total = list.reduce((s: number, r: any) => s + Number(r.importe_total || 0), 0);
  const ingresos_aloja = list.reduce((s: number, r: any) => s + Number(r.importe_alojamiento || r.importe_total || 0), 0);
  const ingresos_extras = list.reduce((s: number, r: any) => s + Number(r.importe_complementarios || 0), 0);
  const noches_totales = list.reduce((s: number, r: any) => s + Number(r.noches || 0), 0);
  const adr = noches_totales > 0 ? ingresos_aloja / noches_totales : 0;

  // Ocupación: noches vendidas / noches disponibles (6 hab × días del rango)
  const dias = Math.max(1, Math.round((new Date(hastaISO).getTime() - new Date(desdeISO).getTime())/86400000) + 1);
  const noches_disponibles = HABITACIONES.length * dias;
  const ocupacion = noches_disponibles > 0 ? (noches_totales / noches_disponibles) * 100 : 0;

  // Por canal
  const porCanal: Record<string, number> = {};
  for (const r of list) porCanal[r.canal || "otro"] = (porCanal[r.canal || "otro"] || 0) + 1;

  return { num, ingresos_total, ingresos_aloja, ingresos_extras, noches_totales, adr, ocupacion, dias, porCanal };
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const desde = u.searchParams.get("desde"); // YYYY-MM-DD
  const hasta = u.searchParams.get("hasta");
  if (!desde || !hasta) return NextResponse.json({ error: "desde y hasta requeridos (YYYY-MM-DD)" }, { status: 400 });

  const supabase = createAdminClient();

  // Periodo actual
  const actual = await metricsForRange(supabase, desde, hasta);

  // Mismo periodo año anterior
  const desdeYA = new Date(desde); desdeYA.setFullYear(desdeYA.getFullYear() - 1);
  const hastaYA = new Date(hasta); hastaYA.setFullYear(hastaYA.getFullYear() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const anterior = await metricsForRange(supabase, fmt(desdeYA), fmt(hastaYA));

  const delta = (a: number, b: number) => b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / b) * 100;

  return NextResponse.json({
    desde, hasta,
    desde_anterior: fmt(desdeYA), hasta_anterior: fmt(hastaYA),
    actual, anterior,
    yoy: {
      num: delta(actual.num, anterior.num),
      ingresos_total: delta(actual.ingresos_total, anterior.ingresos_total),
      ingresos_aloja: delta(actual.ingresos_aloja, anterior.ingresos_aloja),
      ingresos_extras: delta(actual.ingresos_extras, anterior.ingresos_extras),
      adr: delta(actual.adr, anterior.adr),
      ocupacion: delta(actual.ocupacion, anterior.ocupacion),
      noches_totales: delta(actual.noches_totales, anterior.noches_totales),
    }
  }, { headers: { "cache-control": "no-store" }});
}
