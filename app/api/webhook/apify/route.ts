/**
 * POST /api/webhook/apify
 * --------------------------------------------------------------------------
 * Recibe el output del Booking Scraper (voyager/booking-scraper) que invoca
 * Make.com cada lunes 07:00 y escribe los precios snapshot a la tabla
 * `precios_competidores_dia`.
 *
 * Seguridad:
 *   - Header `x-apify-secret` debe coincidir con APIFY_WEBHOOK_SECRET (env).
 *   - Usa service_role para escribir saltándose RLS (precios son INSERT-only
 *     desde server).
 *
 * Payload esperado:
 *   {
 *     "apifyRunId": "bB8ZhVXUftcQFNSzs",
 *     "checkIn": "2026-07-05",
 *     "checkOut": "2026-07-08",
 *     "items": [
 *       {
 *         "name": "Hotel Palacio Obispo",
 *         "url": "https://www.booking.com/hotel/es/obispo.html",
 *         "stars": 3,
 *         "rating": 8.8,
 *         "ratingLabel": "Fabulous",
 *         "reviewsCount": 1403,
 *         "price": 743.18,
 *         "currency": "US$",
 *         "available": true
 *       },
 *       ...
 *     ]
 *   }
 *
 * Make scenario sugerido:
 *   1. Schedule trigger (lunes 07:00 Europe/Madrid)
 *   2. Apify "Run an actor" → voyager/booking-scraper con input fijado
 *   3. HTTP POST → https://panel.mendilore.com/api/webhook/apify
 *      Headers: x-apify-secret: <APIFY_WEBHOOK_SECRET>
 *      Body: { apifyRunId, checkIn, checkOut, items: [...] }
 *
 * Si Make falla, GUGO puede recrear el snapshot llamando este endpoint
 * manualmente con curl + el output del último Apify run.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "edge";

const PayloadSchema = z.object({
  apifyRunId: z.string().min(1),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z.array(
    z.object({
      name: z.string(),
      url: z.string().url().optional(),
      stars: z.number().int().nullable().optional(),
      rating: z.number().nullable().optional(),
      ratingLabel: z.string().nullable().optional(),
      reviewsCount: z.number().int().nullable().optional(),
      price: z.number().nullable().optional(),
      currency: z.string().nullable().optional(),
      available: z.boolean().optional().default(true),
      raw: z.unknown().optional()
    })
  )
});

export async function POST(request: Request) {
  // 1. Verificar secret header
  const secret = request.headers.get("x-apify-secret");
  if (!secret || secret !== process.env.APIFY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parsear y validar payload
  let payload: z.infer<typeof PayloadSchema>;
  try {
    const body = await request.json();
    payload = PayloadSchema.parse(body);
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid payload", details: err instanceof Error ? err.message : "Unknown" },
      { status: 400 }
    );
  }

  const { apifyRunId, checkIn, checkOut, items } = payload;
  const supabase = createAdminClient();

  // 3. Buscar competidores por nombre (case-insensitive)
  const { data: competidores, error: errComp } = await supabase
    .from("competidores")
    .select("id, nombre");

  if (errComp || !competidores) {
    return NextResponse.json({ error: "Could not fetch competidores", details: errComp?.message }, { status: 500 });
  }

  // Mapa para matching difuso por nombre (Hotel Palacio Obispo ≈ Palacio Obispo)
  const normalize = (s: string) =>
    s.toLowerCase().replace(/hotel\s+|spa|&|\s+/g, " ").trim();
  const compMap = new Map(competidores.map((c) => [normalize(c.nombre), c.id]));

  // 4. Construir rows para insert
  const fechaSnapshot = new Date().toISOString().slice(0, 10);
  const rows: any[] = [];
  const skipped: string[] = [];

  for (const item of items) {
    const normName = normalize(item.name);
    let competidor_id: string | undefined;

    // exact match primero
    competidor_id = compMap.get(normName);

    // partial match si no hay exact
    if (!competidor_id) {
      for (const [k, v] of compMap.entries()) {
        if (normName.includes(k) || k.includes(normName)) {
          competidor_id = v;
          break;
        }
      }
    }

    if (!competidor_id) {
      skipped.push(item.name);
      continue;
    }

    // Normalizar currency US$ → USD para el campo moneda
    const moneda = (item.currency ?? "EUR").replace(/^US\$$/, "USD").replace(/^€$/, "EUR").slice(0, 3);

    rows.push({
      competidor_id,
      fecha_snapshot: fechaSnapshot,
      check_in: checkIn,
      check_out: checkOut,
      precio_total: item.price,
      moneda,
      disponible: item.available !== false && item.price !== null && item.price !== undefined,
      rating: item.rating,
      rating_label: item.ratingLabel,
      reviews_count: item.reviewsCount,
      apify_run_id: apifyRunId,
      raw_data: item.raw ?? null
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, error: "No items matched a known competidor" }, { status: 200 });
  }

  // 5. Upsert (replace si ya hay snapshot del mismo día/competidor/fechas)
  const { error: errUpsert, count } = await supabase
    .from("precios_competidores_dia")
    .upsert(rows, { onConflict: "competidor_id,fecha_snapshot,check_in,check_out", count: "exact" });

  if (errUpsert) {
    return NextResponse.json({ error: "Upsert failed", details: errUpsert.message, skipped }, { status: 500 });
  }

  return NextResponse.json({
    inserted: count ?? rows.length,
    skipped,
    apifyRunId,
    fechaSnapshot
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/webhook/apify",
    description: "Recibe output del Apify Booking scraper y escribe a precios_competidores_dia",
    requiredHeaders: ["x-apify-secret"],
    payloadSchema: {
      apifyRunId: "string",
      checkIn: "YYYY-MM-DD",
      checkOut: "YYYY-MM-DD",
      items: "array of { name, url?, stars?, rating?, ratingLabel?, reviewsCount?, price?, currency?, available?, raw? }"
    }
  });
}
