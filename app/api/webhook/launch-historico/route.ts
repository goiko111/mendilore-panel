/**
 * POST /api/webhook/launch-historico
 * Lanza el run histórico de MisterPlan usando el APIFY_TOKEN del env.
 * TEMPORAL — eliminar tras ejecutar.
 */
export const runtime = 'edge';
import { NextResponse } from "next/server";

const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
const ACTOR_ID = "BTwwwDsTQRz3LPaSA";

export async function POST(req: Request) {
  if (req.headers.get("x-admin-secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    return NextResponse.json({ error: "APIFY_TOKEN missing en CF Pages env vars" }, { status: 500 });
  }

  // Coger el INPUT del último run exitoso del actor (para reusar credentials encriptadas)
  let lastInput: any = null;
  try {
    const runsResp = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${apifyToken}&limit=10&desc=true&status=SUCCEEDED`,
      { method: "GET" }
    );
    const runsData = await runsResp.json();
    const lastRun = runsData?.data?.items?.[0];
    if (!lastRun) {
      return NextResponse.json({ error: "no run exitoso previo encontrado", runsData }, { status: 500 });
    }
    // Obtener input del default KVS del último run
    const kvsId = lastRun.defaultKeyValueStoreId;
    const inputResp = await fetch(
      `https://api.apify.com/v2/key-value-stores/${kvsId}/records/INPUT?token=${apifyToken}`,
      { method: "GET" }
    );
    lastInput = await inputResp.json();
  } catch (e: any) {
    return NextResponse.json({ error: "no se pudo obtener input previo", detail: String(e?.message ?? e) }, { status: 500 });
  }

  // Construir input histórico (12 meses atrás + 1 adelante)
  const histInput = {
    ...lastInput,
    monthsAhead: 1,
    monthsBack: 12,
    headless: true,
    debug: false,
  };

  // Lanzar run
  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${apifyToken}&timeout=10800&memory=4096&build=latest`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(histInput),
  });
  const body = await r.json();
  if (!r.ok) {
    return NextResponse.json({ error: "apify run failed", status: r.status, body }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    runId: body?.data?.id,
    console: `https://console.apify.com/actors/${ACTOR_ID}/runs/${body?.data?.id}`,
    status: body?.data?.status,
    plan: "12 meses atrás + 1 adelante · ~3h estimadas"
  });
}
