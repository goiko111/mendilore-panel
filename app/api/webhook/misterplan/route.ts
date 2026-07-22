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

  return NextResponse.json({
    ok: true,
    recibidas: payload.reservas?.length ?? 0,
    insertadas,
    actualizadas,
    errores: errores.length,
    errores_scraping: payload.errors?.length ?? 0,
    primeros_errores: errores.slice(0, 5),
  });
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

