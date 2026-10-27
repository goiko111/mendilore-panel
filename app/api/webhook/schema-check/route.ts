export const runtime='edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { secretoDiagValido } from "@/lib/diag-secret";
export async function GET(req: Request){
  const u=new URL(req.url);
  if(!secretoDiagValido(u.searchParams.get("secret"))) return NextResponse.json({e:"x"},{status:401});
  const s=createAdminClient();
  const {data} = await s.from("reservas").select("*").limit(1);
  return NextResponse.json({
    columnas: data?.[0] ? Object.keys(data[0]).sort() : [],
    sample: data?.[0]
  });
}
