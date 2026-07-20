export const runtime='edge';
import { NextResponse } from "next/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  // Buscar el KVS debug-screenshots (más reciente items)
  const t=process.env.APIFY_TOKEN;
  // Lista stores
  const sr=await fetch(`https://api.apify.com/v2/key-value-stores?token=${t}&limit=10&desc=true`);
  const sd:any=await sr.json();
  const stores=(sd?.data?.items||[]).filter((s:any)=> /debug-screenshots/i.test(s.name||""));
  if(!stores[0]) return NextResponse.json({e:"no debug store"});
  const kvsId=stores[0].id;
  const kr=await fetch(`https://api.apify.com/v2/key-value-stores/${kvsId}/keys?token=${t}&limit=1000`);
  const kd:any=await kr.json();
  const allKeys=(kd?.data?.items||[]);
  // Filtrar png del planning y html de la iframe
  const planningKeys = allKeys.filter((k:any)=> /planning|month|nav|frame|dom|iframe|dump/i.test(k.key));
  const htmlKeys = allKeys.filter((k:any)=> k.key.endsWith('.html'));
  const recentPngs = allKeys.filter((k:any)=> k.key.endsWith('.png')).slice(0,30);
  return NextResponse.json({
    storeId: kvsId,
    totalKeys: allKeys.length,
    planningKeys: planningKeys.map((k:any)=>k.key),
    htmlKeysCount: htmlKeys.length,
    htmlKeysLast: htmlKeys.slice(-10).map((k:any)=>k.key),
    recentPngs: recentPngs.map((k:any)=>({key:k.key, size:k.size})),
  });
}
