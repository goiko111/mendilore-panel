export const runtime = 'edge';
import { NextResponse } from "next/server";
const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
const ACTOR_ID = "BTwwwDsTQRz3LPaSA";

export async function POST(req: Request) {
  if (req.headers.get("x-admin-secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const monthsBack = typeof body?.monthsBack === "number" ? body.monthsBack : 12;
  const monthsAhead = typeof body?.monthsAhead === "number" ? body.monthsAhead : 1;
  const debug = !!body?.debug;
  const timeoutSecs = typeof body?.timeoutSecs === "number" ? body.timeoutSecs : 10800;

  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) return NextResponse.json({ error: "APIFY_TOKEN missing" }, { status: 500 });

  // Coger INPUT del último run exitoso (para reusar credentials)
  const runsResp = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${apifyToken}&limit=10&desc=true&status=SUCCEEDED`
  );
  const runsData: any = await runsResp.json();
  const lastRun = runsData?.data?.items?.[0];
  if (!lastRun) return NextResponse.json({ error: "no run exitoso previo" }, { status: 500 });
  const inputResp = await fetch(
    `https://api.apify.com/v2/key-value-stores/${lastRun.defaultKeyValueStoreId}/records/INPUT?token=${apifyToken}`
  );
  const lastInput: any = await inputResp.json();

  const histInput = {
    ...lastInput,
    monthsAhead,
    monthsBack,
    headless: true,
    debug,
  };

  const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${apifyToken}&timeout=${timeoutSecs}&memory=4096&build=latest`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(histInput),
  });
  const rb: any = await r.json();
  if (!r.ok) return NextResponse.json({ error: "apify failed", status: r.status, body: rb }, { status: 500 });
  return NextResponse.json({
    ok: true,
    runId: rb?.data?.id,
    status: rb?.data?.status,
    plan: { monthsBack, monthsAhead, debug, timeoutSecs },
    console: `https://console.apify.com/actors/${ACTOR_ID}/runs/${rb?.data?.id}`,
  });
}
