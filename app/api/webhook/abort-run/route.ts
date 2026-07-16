export const runtime='edge';
import { NextResponse } from "next/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function POST(req: Request){
  if(req.headers.get("x-admin-secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const body=await req.json().catch(()=>({}));
  const runId=body?.runId;
  if(!runId) return NextResponse.json({e:"no runId"},{status:400});
  const t=process.env.APIFY_TOKEN;
  const r=await fetch(`https://api.apify.com/v2/actor-runs/${runId}/abort?token=${t}`, { method:"POST"});
  const d=await r.json();
  return NextResponse.json({ok:r.ok, status:r.status, data:d});
}
