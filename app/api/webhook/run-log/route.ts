export const runtime = 'edge';
import { NextResponse } from "next/server";
import { secretoDiagValido } from "@/lib/diag-secret";
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (!secretoDiagValido(u.searchParams.get("secret"))) return NextResponse.json({error:"x"},{status:401});
  const runId = u.searchParams.get("runId") || "dQiuAapbdp5LSH0aP";
  const t = process.env.APIFY_TOKEN;
  if (!t) return NextResponse.json({error:"no token"});
  const r = await fetch(`https://api.apify.com/v2/actor-runs/${runId}/log?token=${t}`);
  const log = await r.text();
  return new Response(log.slice(-12000), { headers: { "content-type": "text/plain" }});
}
