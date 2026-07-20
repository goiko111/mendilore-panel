export const runtime='edge';
import { NextResponse } from "next/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const t=process.env.APIFY_TOKEN;
  const sr=await fetch(`https://api.apify.com/v2/key-value-stores?token=${t}&limit=10&desc=true`);
  const sd:any=await sr.json();
  const stores=(sd?.data?.items||[]).filter((s:any)=> /debug-screenshots/i.test(s.name||""));
  if(!stores[0]) return NextResponse.json({e:"no store"});
  const kvsId=stores[0].id;
  // Traer TODAS las keys (paginar si hace falta)
  let allKeys:any[]=[];
  let exclusiveStartKey='';
  for (let page=0; page<10; page++) {
    const kr=await fetch(`https://api.apify.com/v2/key-value-stores/${kvsId}/keys?token=${t}&limit=1000${exclusiveStartKey ? '&exclusiveStartKey='+encodeURIComponent(exclusiveStartKey) : ''}`);
    const kd:any=await kr.json();
    const items=kd?.data?.items||[];
    if(!items.length) break;
    allKeys.push(...items);
    if(items.length<1000) break;
    exclusiveStartKey=items[items.length-1].key;
  }
  // Extraer timestamp de fin del nombre y ordenar descendente
  const withTs = allKeys.map((k:any) => {
    const m = k.key.match(/-(\d{13})\./);
    return { ...k, ts: m ? parseInt(m[1]) : 0 };
  }).sort((a,b) => b.ts - a.ts);
  return NextResponse.json({
    storeId: kvsId,
    total: allKeys.length,
    latest30: withTs.slice(0,30).map((k:any)=>({key:k.key, size:k.size, ts:k.ts, iso:new Date(k.ts).toISOString().slice(0,19)})),
    planningRelated: withTs.filter((k:any)=>/planning|month|frame|iframe|nav|calendar/i.test(k.key)).slice(0,20).map((k:any)=>k.key),
  });
}
