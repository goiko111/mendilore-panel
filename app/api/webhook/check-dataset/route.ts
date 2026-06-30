export const runtime = 'edge';
import { NextResponse } from "next/server";
const SECRET = "mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== SECRET) return NextResponse.json({error:"x"},{status:401});
  const runId = url.searchParams.get("runId") || "dQiuAapbdp5LSH0aP";
  const t = process.env.APIFY_TOKEN;
  if (!t) return NextResponse.json({error:"no token"});
  const r = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${t}`);
  const rd: any = await r.json();
  const dsId = rd?.data?.defaultDatasetId;
  const kvsId = rd?.data?.defaultKeyValueStoreId;
  // Stats del dataset
  const dsResp = await fetch(`https://api.apify.com/v2/datasets/${dsId}?token=${t}`);
  const ds: any = await dsResp.json();
  // Primer y último item
  const itemsResp = await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${t}&limit=3`);
  const items: any = await itemsResp.json();
  const itemsLastResp = await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${t}&limit=3&desc=true`);
  const itemsLast: any = await itemsLastResp.json();
  // Output del KVS (suele contener resumen)
  const outResp = await fetch(`https://api.apify.com/v2/key-value-stores/${kvsId}/records/OUTPUT?token=${t}`);
  let output: any = null;
  try { output = await outResp.json(); } catch {}
  return NextResponse.json({
    runStatus: rd?.data?.status,
    runDuration: rd?.data?.stats?.runTimeSecs,
    dataset: { id: dsId, count: ds?.data?.itemCount, cleanItems: ds?.data?.cleanItemCount },
    firstItems: items?.slice ? items.slice(0,3) : items,
    lastItems: itemsLast?.slice ? itemsLast.slice(0,3) : itemsLast,
    output,
  });
}
