export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { inicioHistorico } from "@/lib/historico";

const HABITACIONES = ["cala","nube","margarita","lino","limonero","lavanda"];

async function metricsForRange(supabase: any, desdeISO: string, hastaISO: string, historicoDesde: string | null = null) {
  // Fuente 1: produccion_dia (misma lógica día a día que Métricas → consistencia)
  const { data: dias, error: e1 } = await supabase
    .from("produccion_dia")
    .select("dia, habitaciones_ocupadas, ingresos_alojamiento, ingresos_complementarios, ingresos_total")
    .gte("dia", desdeISO)
    .lte("dia", hastaISO);
  if (e1) throw e1;

  const noches_totales = (dias || []).reduce((s: number, d: any) => s + Number(d.habitaciones_ocupadas || 0), 0);
  const ingresos_aloja = (dias || []).reduce((s: number, d: any) => s + Number(d.ingresos_alojamiento || 0), 0);
  const ingresos_extras = (dias || []).reduce((s: number, d: any) => s + Number(d.ingresos_complementarios || 0), 0);
  const ingresos_total = (dias || []).reduce((s: number, d: any) => s + Number(d.ingresos_total || 0), 0);

  // Días sin datos cargados (antes de junio de 2025) no cuentan como
  // disponibles: si no, la ocupación de 2025 salía a la mitad (feedback 21/11).
  const inicio = historicoDesde && desdeISO < historicoDesde ? historicoDesde : desdeISO;
  const diasRango = Math.max(1, Math.round((new Date(hastaISO).getTime() - new Date(inicio).getTime())/86400000) + 1);
  const noches_disponibles = HABITACIONES.length * diasRango;
  // Ocupación clásica: noches vendidas dentro del rango / noches disponibles — nunca >100%
  const ocupacion = Math.min(100, (noches_totales / noches_disponibles) * 100);
  const adr = noches_totales > 0 ? ingresos_aloja / noches_totales : 0;

  // Fuente 2: reservas con check-in en el rango (solo para conteo y canal)
  const { data: resvs, error: e2 } = await supabase
    .from("reservas")
    .select("id, canal")
    .gte("fecha_in", desdeISO)
    .lte("fecha_in", hastaISO)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .in("habitacion", HABITACIONES);
  if (e2) throw e2;

  const num = (resvs || []).length;
  const porCanal: Record<string, number> = {};
  for (const r of resvs || []) porCanal[r.canal || "otro"] = (porCanal[r.canal || "otro"] || 0) + 1;

  return { num, ingresos_total, ingresos_aloja, ingresos_extras, noches_totales, adr, ocupacion, dias: diasRango, porCanal };
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const desde = u.searchParams.get("desde");
  const hasta = u.searchParams.get("hasta");
  if (!desde || !hasta) return NextResponse.json({ error: "desde y hasta requeridos (YYYY-MM-DD)" }, { status: 400 });

  const supabase = createAdminClient();
  // Histórico cargado desde junio de 2025 (feedback Juan 21/11)
  const historicoDesde = await inicioHistorico(supabase);
  const actual = await metricsForRange(supabase, desde, hasta, historicoDesde);

  const desdeYA = new Date(desde); desdeYA.setFullYear(desdeYA.getFullYear() - 1);
  const hastaYA = new Date(hasta); hastaYA.setFullYear(hastaYA.getFullYear() - 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const anterior = await metricsForRange(supabase, fmt(desdeYA), fmt(hastaYA), historicoDesde);

  const delta = (a: number, b: number) => b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / b) * 100;

  // Si el rango anterior empieza antes del histórico, la comparativa sale
  // contra días vacíos: el cliente no muestra la variación.

  return NextResponse.json({
    desde, hasta,
    desde_anterior: fmt(desdeYA), hasta_anterior: fmt(hastaYA),
    historico_desde: historicoDesde,
    anterior_incompleto: historicoDesde !== null && fmt(desdeYA) < historicoDesde,
    actual_incompleto: historicoDesde !== null && desde < historicoDesde,
    actual, anterior,
    yoy: {
      num: delta(actual.num, anterior.num),
      ingresos_total: delta(actual.ingresos_total, anterior.ingresos_total),
      ingresos_aloja: delta(actual.ingresos_aloja, anterior.ingresos_aloja),
      ingresos_extras: delta(actual.ingresos_extras, anterior.ingresos_extras),
      adr: delta(actual.adr, anterior.adr),
      ocupacion: delta(actual.ocupacion, anterior.ocupacion),
      noches_totales: delta(actual.noches_totales, anterior.noches_totales),
    },
    nota: "Noches/ingresos/ADR/ocupación calculados con produccion_dia (misma fuente que Métricas). Noches recortadas al rango — ocupación nunca >100%."
  }, { headers: { "cache-control": "no-store" }});
}
