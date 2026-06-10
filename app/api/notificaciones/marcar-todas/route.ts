export const runtime = 'edge';

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createAdminClient();
  await supabase
    .from("notificaciones")
    .update({ leida: true, leida_en: new Date().toISOString() })
    .eq("leida", false);
  return NextResponse.redirect(new URL("/notificaciones", "https://panel.mendilore.com"));
}
