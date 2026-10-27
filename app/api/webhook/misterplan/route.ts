/**
 * POST /api/webhook/misterplan
 * --------------------------------------------------------------------------
 * Recibe el payload del Apify Actor misterplan-scraper y hace upsert
 * idempotente de cada reserva + huésped en Supabase usando la función SQL
 * `upsert_reserva_misterplan` (ver migration 0007).
 *
 * Auth: header `x-misterplan-secret` debe coincidir con env var
 * MISTERPLAN_WEBHOOK_SECRET (configurada en CF Pages).
 *
 * Idempotencia: si re-ejecutan el scraper con las mismas reservas, no
 * duplica. La clave es `id_externo_misterplan` que es UNIQUE.
 *
 * Logs: cada llamada queda en `logs_actividad` con:
 *   - reservas_recibidas
 *   - reservas_insertadas
 *   - reservas_actualizadas
 *   - errores
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type ScrapingError = {
  step: string;
  error: string;
  reservaIndex?: number;
};

type ReservaPayload = {
  id_reserva: string;
  localizador_externo: string | null;
  canal: string;
  habitacion: string;
  fecha_in: string;
  fecha_out: string;
  noches: number;
  huesped_nombre: string;
  huesped_apellidos: string | null;
  huesped_email: string | null;
  huesped_telefono: string | null;
  huesped_pais: string | null;
  huesped_documento: string | null;
  importe_total: number;
  importe_alojamiento?: number | null;
  importe_complementarios?: number;
  importe_moneda: string;
  anticipo: number;
  pendiente_cobro: number;
  estado_reserva: string;
  estado_cobro: string;
  forma_pago: string | null;
  factura_num: string | null;
  fecha_reserva: string;
  observaciones: string | null;
  num_huespedes: number | null;
  complementarios?: Array<{ concepto: string; cantidad: number; fecha: string | null; importe: number; raw_text?: string }>;
};

type Payload = {
  source: "misterplan";
  scrapedAt: string;
  monthsScraped: number;
  reservas: ReservaPayload[];
  errors: ScrapingError[];
  sessionRefreshed: boolean;
};

export async function POST(request: Request) {
  // Auth
  const secret = request.headers.get("x-misterplan-secret");
  if (!secret || secret !== process.env.MISTERPLAN_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = await request.json();
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.source !== "misterplan") {
    return NextResponse.json({ ok: false, error: "Invalid source" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fin de pasada completa: reconciliar (ver reconciliar() más abajo)
  if ((payload as any).tipo === "fin_pasada") {
    return reconciliar(supabase, payload as unknown as FinPasada);
  }

  // Fechas del scraper de competencia (ver refrescarFechasCompetencia())
  if ((payload as any).tipo === "refrescar_competencia") {
    const r = await refrescarFechasCompetencia();
    await supabase.from("logs_actividad").insert({ evento: "competencia_fechas_refrescadas", detalles: r });
    return NextResponse.json(r, { status: r.ok ? 200 : 207 });
  }

  let insertadas = 0;
  let actualizadas = 0;
  const errores: Array<{ id_reserva: string; error: string }> = [];

  for (const reserva of payload.reservas ?? []) {
    try {
      const { data, error } = await supabase.rpc("upsert_reserva_misterplan", {
        payload: reserva as any,
      });
      if (error) {
        errores.push({ id_reserva: reserva.id_reserva, error: error.message });
        continue;
      }
      const accion = (data as any)?.[0]?.accion;
      const reserva_id = (data as any)?.[0]?.reserva_id;
      if (accion === "insert") insertadas++;
      else if (accion === "update") actualizadas++;

      // Fase 2: persistir líneas granulares de complementarios si el scraper las mandó
      const lineas = (reserva as any).complementarios;
      if (reserva_id && Array.isArray(lineas) && lineas.length > 0) {
        try {
          await supabase.rpc("upsert_complementarios_reserva", {
            p_reserva_id: reserva_id,
            p_lineas: lineas as any,
          });
        } catch (e) {
          errores.push({ id_reserva: reserva.id_reserva, error: `complementarios: ${(e as Error).message}` });
        }
      }
    } catch (err) {
      errores.push({ id_reserva: reserva.id_reserva, error: (err as Error).message });
    }
  }

  // ESCALADO DE ERRORES (sep 2026)
  // Durante meses el CHECK de estado_cobro rechazó toda reserva 'parcial' —
  // la mitad de cada lote— y este webhook se limitaba a contarlas y devolver
  // ok:true. Nadie se enteró. Ahora un porcentaje alto de rechazos genera una
  // alerta explícita y la respuesta deja de ser un OK silencioso.
  const recibidas = payload.reservas?.length ?? 0;
  const tasaError = recibidas > 0 ? errores.length / recibidas : 0;
  const falloGrave = errores.length > 0 && (tasaError >= 0.2 || errores.length >= 10);

  if (falloGrave) {
    await supabase.from("logs_actividad").insert({
      evento: "misterplan_sync_error_grave",
      detalles: {
        mensaje: `${errores.length} de ${recibidas} reservas rechazadas (${Math.round(tasaError * 100)}%)`,
        tasa_error: Number(tasaError.toFixed(3)),
        muestra_errores: errores.slice(0, 10),
        scraped_at: payload.scrapedAt,
      },
    });
    console.error("[misterplan-webhook] tasa de rechazo alta", {
      recibidas,
      errores: errores.length,
      pct: Math.round(tasaError * 100),
      muestra: errores.slice(0, 3),
    });
  }

  // Log resultado
  await supabase.from("logs_actividad").insert({
    evento: errores.length > 0 ? "misterplan_sync_parcial" : "misterplan_sync_ok",
    detalles: {
      scraped_at: payload.scrapedAt,
      months_scraped: payload.monthsScraped,
      reservas_recibidas: payload.reservas?.length ?? 0,
      reservas_insertadas: insertadas,
      reservas_actualizadas: actualizadas,
      errores_upsert: errores.length,
      errores_scraping: payload.errors?.length ?? 0,
      session_refreshed: payload.sessionRefreshed,
      primeros_errores: errores.slice(0, 5),
    },
  });

  // Si hubo errores de scraping (no del upsert), también dejarlos como log separado
  if ((payload.errors?.length ?? 0) > 0) {
    await supabase.from("logs_actividad").insert({
      evento: "misterplan_scraping_errores",
      detalles: { errores: payload.errors?.slice(0, 20) },
    });
  }

  // 207 (Multi-Status) cuando el lote se ha degradado: el scraper lo registra
  // como aviso en su log en vez de darlo por bueno.
  return NextResponse.json(
    {
      ok: !falloGrave,
      degradado: falloGrave,
      recibidas,
      insertadas,
      actualizadas,
      errores: errores.length,
      tasa_error_pct: Math.round(tasaError * 100),
      errores_scraping: payload.errors?.length ?? 0,
      primeros_errores: errores.slice(0, 5),
    },
    { status: falloGrave ? 207 : 200 },
  );
}

type FinPasada = {
  tipo: "fin_pasada";
  scrapedAt: string;
  desde: string;   // YYYY-MM-DD · primer día recorrido
  hasta: string;   // YYYY-MM-DD · límite del recorrido
  vistas: Array<{ id: string; hab: string }>;
  fallidas: Array<{ fecha_inicio: string; fecha_fin: string }>;
  /** true = calcular y registrar, sin marcar nada */
  simular?: boolean;
};

const HABITACIONES = ["cala", "nube", "margarita", "lino", "limonero", "lavanda"];

/**
 * RECONCILIACIÓN TRAS UNA PASADA COMPLETA
 *
 * El robot solo inserta y actualiza. Si en MisterPlan se anula una reserva o
 * se cambia de habitación, la fila vieja se quedaba aquí contando noches e
 * ingresos: llegó a haber 20 habitación-noche ocupadas dos veces y días con
 * más reservas que habitaciones.
 *
 * Al terminar una pasada que ha recorrido TODO un rango de fechas, el robot
 * manda la lista de (reserva, habitación) que ha visto. Las filas activas de
 * ese rango que no están en la lista ya no existen en MisterPlan y se marcan
 * como anuladas. No se borra nada: si la reserva vuelve a aparecer, el upsert
 * la reactiva con su estado real.
 *
 * Salvaguardas (este proyecto ya estuvo a punto de borrar 452 reservas buenas
 * con un criterio parecido):
 *   · se excluye toda fila que se solape con una ficha que no se pudo leer;
 *   · si salen más candidatas que el tope, no se toca NADA y queda registrado.
 */
async function reconciliar(supabase: ReturnType<typeof createAdminClient>, p: FinPasada) {
  const desde = String(p.desde || "");
  const hasta = String(p.hasta || "");
  const vistas = Array.isArray(p.vistas) ? p.vistas : [];
  const fallidas = Array.isArray(p.fallidas) ? p.fallidas : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || vistas.length === 0) {
    return NextResponse.json({ ok: false, error: "fin_pasada incompleto" }, { status: 400 });
  }

  const visto = new Set(vistas.map((v) => `${v.id}|${v.hab}`));

  const filas: any[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase
      .from("reservas")
      .select("id, id_externo_misterplan, habitacion, fecha_in, fecha_out, importe_total")
      .not("estado_reserva", "in", "(cancelada,no_show)")
      .in("habitacion", HABITACIONES)
      .lt("fecha_in", hasta)
      .gt("fecha_out", desde)
      .range(i, i + 999);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // fecha_fin del planning es la última noche: se suma un día por prudencia.
  const masUnDia = (d: string) => {
    const x = new Date(d + "T00:00:00Z");
    x.setUTCDate(x.getUTCDate() + 1);
    return x.toISOString().slice(0, 10);
  };
  const protegida = (r: any) =>
    fallidas.some((f) => f.fecha_inicio && f.fecha_fin && r.fecha_in < masUnDia(f.fecha_fin) && r.fecha_out > f.fecha_inicio);

  const noVistas = filas.filter((r) => !visto.has(`${r.id_externo_misterplan}|${r.habitacion}`));
  const candidatas = noVistas.filter((r) => !protegida(r));
  const tope = Math.max(10, Math.ceil(filas.length * 0.1));
  const resumen = {
    rango: `${desde}..${hasta}`,
    filas_en_rango: filas.length,
    vistas_por_el_robot: vistas.length,
    no_vistas: noVistas.length,
    protegidas_por_fallo_de_lectura: noVistas.length - candidatas.length,
    candidatas: candidatas.length,
    tope,
    detalle: candidatas.slice(0, 60).map((r) => ({
      id: r.id_externo_misterplan, habitacion: r.habitacion, entrada: r.fecha_in, salida: r.fecha_out, total: r.importe_total,
    })),
  };

  if (p.simular) {
    await supabase.from("logs_actividad").insert({ evento: "misterplan_reconciliacion_simulada", detalles: resumen });
    return NextResponse.json({ ok: true, aplicada: false, simulada: true, ...resumen });
  }

  if (candidatas.length > tope) {
    await supabase.from("logs_actividad").insert({ evento: "misterplan_reconciliacion_abortada", detalles: resumen });
    return NextResponse.json({ ok: false, aplicada: false, motivo: "demasiadas candidatas", ...resumen }, { status: 207 });
  }

  if (candidatas.length > 0) {
    const { error } = await supabase
      .from("reservas")
      .update({ estado_reserva: "cancelada", actualizado_en: new Date().toISOString() })
      .in("id", candidatas.map((r) => r.id));
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("logs_actividad").insert({ evento: "misterplan_reconciliacion", detalles: resumen });
  return NextResponse.json({ ok: true, aplicada: true, ...resumen });
}

/**
 * FECHAS DEL SCRAPER DE COMPETENCIA
 *
 * El schedule de Apify que lanza voyager/booking-scraper tenía las fechas de
 * entrada escritas a mano en junio (15/06, 22/06, 08/07, 07/08, 06/09, 06/10,
 * 05/12 y 08/06/2027). Desde el verano consultaba precios de fechas ya
 * pasadas y la pantalla de Competencia salía casi entera en "Sin precio".
 *
 * Cada noche el robot de MisterPlan llama aquí y se reescriben las URLs con
 * entradas relativas a hoy. Los hoteles se conservan tal cual estaban en el
 * schedule y se añaden los de la tabla competidores que falten.
 */
const SCHEDULE_COMPETENCIA = "rbYMVODnDmGh8zdtX";
const DIAS_VISTA = [7, 14, 30, 60, 90, 180];
const NOCHES_VISTA = 3;

async function refrescarFechasCompetencia(): Promise<Record<string, unknown> & { ok: boolean }> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return { ok: false, error: "APIFY_TOKEN no configurado en el panel" };
  const base = "https://api.apify.com/v2";
  const auth = { Authorization: `Bearer ${token}` };

  const r = await fetch(`${base}/schedules/${SCHEDULE_COMPETENCIA}`, { headers: auth });
  if (!r.ok) return { ok: false, error: `leer schedule: HTTP ${r.status}` };
  const sched = (await r.json())?.data;
  const accion = sched?.actions?.[0];
  if (!accion?.runInput?.body) return { ok: false, error: "schedule sin input" };

  const body = JSON.parse(accion.runInput.body);
  const slugs = new Set<string>();
  for (const u of body.startUrls ?? []) {
    const m = String(u?.url ?? "").match(/\/hotel\/es\/([^.?/]+)/);
    if (m) slugs.add(m[1]);
  }
  try {
    const supabase = createAdminClient();
    const { data: comps } = await supabase
      .from("competidores")
      .select("booking_slug, booking_url, activo, es_propia")
      .eq("activo", true);
    for (const c of comps ?? []) {
      if ((c as any).es_propia) continue; // nuestro propio precio sale de las reservas reales
      const m = String((c as any).booking_url ?? "").match(/\/hotel\/es\/([^.?/]+)/);
      const slug = (c as any).booking_slug || (m ? m[1] : null);
      if (slug) slugs.add(slug);
    }
  } catch { /* nos quedamos con los del schedule */ }
  if (slugs.size === 0) return { ok: false, error: "no hay hoteles en el schedule" };

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const startUrls: Array<{ url: string }> = [];
  const entradas: string[] = [];
  for (const dias of DIAS_VISTA) {
    const ci = new Date();
    ci.setUTCDate(ci.getUTCDate() + dias);
    const co = new Date(ci);
    co.setUTCDate(co.getUTCDate() + NOCHES_VISTA);
    entradas.push(iso(ci));
    for (const slug of slugs) {
      startUrls.push({
        url: `https://www.booking.com/hotel/es/${slug}.html?checkin=${iso(ci)}&checkout=${iso(co)}&group_adults=2&no_rooms=1&group_children=0`,
      });
    }
  }
  body.startUrls = startUrls;
  accion.runInput.body = JSON.stringify(body);

  const put = await fetch(`${base}/schedules/${SCHEDULE_COMPETENCIA}`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ actions: sched.actions }),
  });
  if (!put.ok) return { ok: false, error: `escribir schedule: HTTP ${put.status}` };
  return { ok: true, hoteles: Array.from(slugs), entradas, urls: startUrls.length };
}

// GET para healthcheck rápido
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "misterplan-webhook",
    method: "POST",
    auth: "header x-misterplan-secret",
  });
}

