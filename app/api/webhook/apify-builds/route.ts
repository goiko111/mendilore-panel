export const runtime='edge';
import { NextResponse } from "next/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
const ACTOR_ID="BTwwwDsTQRz3LPaSA";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const t=process.env.APIFY_TOKEN;
  if(!t) return NextResponse.json({e:"no token"});
  const r=await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/builds?token=${t}&limit=5&desc=true`);
  const d:any=await r.json();
  return NextResponse.json({
    builds: (d?.data?.items||[]).map((b:any)=>({
      id: b.id, buildNumber: b.buildNumber, status: b.status,
      startedAt: b.startedAt, finishedAt: b.finishedAt,
      gitSha: b.buildOptions?.gitSha, tag: b.tag
    }))
  });
}
