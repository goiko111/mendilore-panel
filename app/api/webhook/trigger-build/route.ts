export const runtime='edge';
import { NextResponse } from "next/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
const ACTOR_ID="BTwwwDsTQRz3LPaSA";
export async function POST(req: Request){
  if(req.headers.get("x-admin-secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const t=process.env.APIFY_TOKEN;
  // Force new build. tag=latest para que el próximo run lo use por defecto
  const url=`https://api.apify.com/v2/acts/${ACTOR_ID}/builds?token=${t}&tag=latest&useCache=false&waitForFinish=0&version=0.0`;
  const r=await fetch(url, { method:"POST" });
  const d=await r.json();
  return NextResponse.json({ok:r.ok, status:r.status, build: d?.data});
}
