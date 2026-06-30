/**
 * GET /api/webhook/check-historico?secret=...&runId=...
 * Devuelve status del run y verifica si los datos llegaron a BD.
 * TEMPORAL — eliminar tras histórico.
 */
export const runtime = 'edge';
import { NextResponse } from "next/server";

const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
const ACTOR_ID = "BTwwwDsTQRz3LPaSA";
const SUPABASE_URL = "https://itaftpmelcswvphzqgkc.supabase.co";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const runId = url.searchParams.get("runId") || "dQiuAapbdp5LSH0aP";
  const apifyToken = process.env.APIFY_TOKEN;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apifyToken || !srk) return NextResponse.json({ error: "env vars missing" }, { status: 500 });

  // 1) Status del run
  const runResp = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyToken}`);
  const runData: any = await runResp.json();
  const run = runData?.data || {};
  const status = run.status;
  const finishedAt = run.finishedAt;
  const stats = run.stats || {};
  const usage = run.usage || {};

  // 2) Contar filas en BD
  const q = async (path: string) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: srk, Authorization: `Bearer ${srk}`, Prefer: "count=exact", Range: "0-0" }
    });
    const cr = r.headers.get("content-range") || "0/0";
    return Number(cr.split("/")[1] || 0);
  };
  const [reservas, ocupacion] = await Promise.all([
    q("reservas?select=id"),
    q("ocupacion_mes?select=anio")
  ]);

  return NextResponse.json({
    runId,
    status,
    finishedAt,
    durationS: stats.runTimeSecs,
    computeUnits: usage?.ACTOR_COMPUTE_UNITS,
    usdCost: usage?.totalUsd,
    db: { reservas, ocupacionMes: ocupacion },
    isFinished: ["SUCCEEDED","FAILED","ABORTED","TIMED-OUT"].includes(status),
    consoleUrl: `https://console.apify.com/actors/${ACTOR_ID}/runs/${runId}`,
  });
}
