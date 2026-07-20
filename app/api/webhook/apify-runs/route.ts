export const runtime='edge';
import { NextResponse } from "next/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
const ACTOR_ID="BTwwwDsTQRz3LPaSA";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const t=process.env.APIFY_TOKEN;
  const r=await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${t}&limit=8&desc=true`);
  const d:any=await r.json();
  return NextResponse.json({
    runs: (d?.data?.items||[]).map((r:any)=>({
      id: r.id, status: r.status, buildId: r.buildId,
      startedAt: r.startedAt, finishedAt: r.finishedAt,
      duration: r.stats?.runTimeSecs
    }))
  });
}
