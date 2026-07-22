export const runtime='edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
const SECRET="mendilore-temp-2026-06-22-launch-hist-aBc9X3";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(u.searchParams.get("secret")!==SECRET) return NextResponse.json({e:"x"},{status:401});
  const s=createAdminClient();
  const {data} = await s.from("reservas").select("*").limit(1);
  return NextResponse.json({
    columnas: data?.[0] ? Object.keys(data[0]).sort() : [],
    sample: data?.[0]
  });
}
