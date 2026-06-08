/**
 * POST /api/webhook/apify
 * --------------------------------------------------------------------------
 * Recibe el output del Booking Scraper (voyager/booking-scraper) y escribe
 * los precios snapshot a la tabla `precios_competidores_dia`.
 *
 * Soporta DOS modos de payload:
 *
 *   1) APIFY NATIVO (recomendado — Apify Schedule + webhook nativo):
 *      {
 *        "userId": "...",
 *        "createdAt": "...",
 *        "eventType": "ACTOR.RUN.SUCCEEDED",
 *        "eventData": { "actorId": "...", "actorRunId": "..." },
 *        "resource": { ... }
 *      }
 *      El webhook hace fetch al dataset via Apify API (necesita APIFY_TOKEN).
 *      checkIn/checkOut se calculan = today+30 / today+33 (coincide con input).
 *
 *   2) LEGACY MAKE (con items pre-agregados en body):
 *      {
 *        "apifyRunId": "...",
 *        "checkIn": "2026-07-05",
 *        "checkOut": "2026-07-08",
 *        "items": [...]
 *      }
 *
 * Seguridad: header `x-apify-secret` debe coincidir con APIFY_WEBHOOK_SECRET.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "edge";

type ApifyItem = {
  name?: string;
  url?: string;
  stars?: number | null;
  rating?: number | null;
  ratingLabel?: string | null;
  reviewsCount?: number | null;
  price?: number | null;
  currency?: string | null;
  available?: boolean;
  [k: string]: unknown;
};

function todayPlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchApifyDataset(actorRunId: string, token: string): Promise<{ items: ApifyItem[]; datasetId: string }> {
  // Use Authorization header (more reliable than query string)
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 1. Get run metadata to find defaultDatasetId
  const runUrl = `https://api.apify.com/v2/actor-runs/${actorRunId}`;
  const runRes = await fetch(runUrl, { headers: authHeaders });
  if (!runRes.ok) {
    const errBody = await runRes.text();
    throw new Error(`Apify run fetch failed: ${runRes.status} ${errBody.slice(0, 200)}`);
  }
  const runJson: any = await runRes.json();
  const datasetId = runJson?.data?.defaultDatasetId;
  if (!datasetId) throw new Error(`No defaultDatasetId in run metadata: ${JSON.stringify(runJson).slice(0, 200)}`);

  // 2. Fetch dataset items (uses same auth)
  const dsUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json`;
  const dsRes = await fetch(dsUrl, { headers: authHeaders });
  if (!dsRes.ok) {
    const errBody = await dsRes.text();
    throw new Error(`Apify dataset fetch failed: ${dsRes.status} ${errBody.slice(0, 200)}`);
  }
  const items: ApifyItem[] = await dsRes.json();
  return { items, datasetId };
}

export async function POST(request: Request) {
  // 1. Verify secret header
  const secret = request.headers.get("x-apify-secret");
  if (!secret || secret !== process.env.APIFY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3. Detect mode and obtain items + apifyRunId + checkIn/checkOut
  let items: ApifyItem[];
  let apifyRunId: string;
  let checkIn: string;
  let checkOut: string;
  let mode: "apify-native" | "legacy-make";

  if (body?.eventData?.actorRunId) {
    // APIFY NATIVO
    mode = "apify-native";
    apifyRunId = body.eventData.actorRunId;
    const apifyToken = process.env.APIFY_TOKEN;
    const tokenPresent = !!apifyToken;
    const tokenLen = apifyToken?.length ?? 0;
    const tokenPrefix = apifyToken ? apifyToken.slice(0, 12) + "..." : "(missing)";
    if (!apifyToken) {
      return NextResponse.json({ error: "APIFY_TOKEN not configured", tokenPresent, tokenLen }, { status: 500 });
    }
    try {
      const fetched = await fetchApifyDataset(apifyRunId, apifyToken);
      items = fetched.items;
    } catch (err) {
      return NextResponse.json(
        {
          error: "Failed to fetch dataset from Apify",
          details: err instanceof Error ? err.message : "Unknown",
          debug: { tokenPresent, tokenLen, tokenPrefix, apifyRunId }
        },
        { status: 500 }
      );
    }
    // checkIn/checkOut = today + 30 / today + 33 (matches actor input)
    checkIn = todayPlus(30);
    checkOut = todayPlus(33);
  } else if (Array.isArray(body?.items)) {
    // LEGACY MAKE
    mode = "legacy-make";
    apifyRunId = String(body.apifyRunId ?? "manual");
    items = body.items;
    checkIn = String(body.checkIn ?? todayPlus(30));
    checkOut = String(body.checkOut ?? todayPlus(33));
  } else {
    return NextResponse.json(
      { error: "Invalid payload: expected eventData.actorRunId (Apify native) or items array (Make legacy)" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // 4. Fetch competidores for fuzzy name matching
  const { data: competidores, error: errComp } = await supabase.from("competidores").select("id, nombre");
  if (errComp || !competidores) {
    return NextResponse.json({ error: "Could not fetch competidores", details: errComp?.message }, { status: 500 });
  }

  const normalize = (s: string) =>
    s.toLowerCase().replace(/hotel\s+|spa|&|\s+/g, " ").trim();
  const compMap = new Map(competidores.map((c) => [normalize(c.nombre), c.id]));

  // 5. Build rows
  const fechaSnapshot = new Date().toISOString().slice(0, 10);
  const rows: any[] = [];
  const skipped: string[] = [];

  for (const item of items) {
    if (!item?.name) {
      skipped.push("(no name)");
      continue;
    }
    const normName = normalize(item.name);
    let competidor_id: string | undefined = compMap.get(normName);

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

    const moneda = (item.currency ?? "EUR")
      .replace(/^US\$$/, "USD")
      .replace(/^€$/, "EUR")
      .slice(0, 3);

    rows.push({
      competidor_id,
      fecha_snapshot: fechaSnapshot,
      check_in: checkIn,
      check_out: checkOut,
      precio_total: typeof item.price === "number" ? item.price : null,
      moneda,
      disponible: item.available !== false && item.price !== null && item.price !== undefined,
      rating: typeof item.rating === "number" ? item.rating : null,
      rating_label: item.ratingLabel ?? null,
      reviews_count: typeof item.reviewsCount === "number" ? item.reviewsCount : null,
      apify_run_id: apifyRunId,
      raw_data: item as any
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ mode, inserted: 0, skipped, error: "No items matched a known competidor" }, { status: 200 });
  }

  // 6. Upsert
  const { error: errUpsert, count } = await supabase
    .from("precios_competidores_dia")
    .upsert(rows, { onConflict: "competidor_id,fecha_snapshot,check_in,check_out", count: "exact" });

  if (errUpsert) {
    return NextResponse.json({ error: "Upsert failed", details: errUpsert.message, mode, skipped }, { status: 500 });
  }

  return NextResponse.json({
    mode,
    inserted: count ?? rows.length,
    skipped,
    apifyRunId,
    fechaSnapshot,
    checkIn,
    checkOut
  });
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/webhook/apify",
    description: "Recibe Apify Schedule webhook (modo nativo) o Make POST (modo legacy)",
    requiredHeaders: ["x-apify-secret"],
    modes: {
      "apify-native": {
        payload: '{ "eventData": { "actorRunId": "..." }, "eventType": "ACTOR.RUN.SUCCEEDED" }',
        requires: ["APIFY_TOKEN env var"]
      },
      "legacy-make": {
        payload: '{ "apifyRunId": "...", "checkIn": "YYYY-MM-DD", "checkOut": "YYYY-MM-DD", "items": [...] }'
      }
    }
  });
}
