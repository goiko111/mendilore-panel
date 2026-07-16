export const runtime='edge';
import { NextResponse } from "next/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const t=process.env.APIFY_TOKEN;
  // Buscar key-value store con nombre debug-screenshots
  // Los KVS por defecto van asociados a runs. Necesitamos listar KVS del usuario
  const r=await fetch(`https://api.apify.com/v2/key-value-stores?token=${t}&limit=20&desc=true`);
  const d:any=await r.json();
  const stores=(d?.data?.items||[]).filter((s:any)=> /debug-screenshots|misterplan-session/i.test(s.name||""));
  // Para cada store, listar keys recientes
  const detail=await Promise.all(stores.slice(0,3).map(async (st:any)=>{
    const kr=await fetch(`https://api.apify.com/v2/key-value-stores/${st.id}/keys?token=${t}&limit=200`);
    const kd:any=await kr.json();
    return {
      storeId: st.id, storeName: st.name, itemCount: st.itemCount,
      modified: st.modifiedAt,
      keys: (kd?.data?.items||[]).map((k:any)=>({key:k.key,size:k.size}))
    };
  }));
  return NextResponse.json({ stores: detail });
}
