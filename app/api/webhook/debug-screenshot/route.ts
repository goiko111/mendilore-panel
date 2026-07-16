export const runtime='edge';
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return new Response("x", {status:401});
  const storeId=u.searchParams.get("storeId");
  const key=u.searchParams.get("key");
  if(!storeId||!key) return new Response("missing", {status:400});
  const t=process.env.APIFY_TOKEN;
  const r=await fetch(`https://api.apify.com/v2/key-value-stores/${storeId}/records/${encodeURIComponent(key)}?token=${t}`);
  return new Response(r.body, { headers: { "content-type": r.headers.get("content-type") || "image/png" }});
}
