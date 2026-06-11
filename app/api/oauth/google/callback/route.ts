export const runtime = 'edge';

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const REDIRECT_URI = "https://panel.mendilore.com/api/oauth/google/callback";
const GA4_PROPERTY_ID = "540181854";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error) return NextResponse.redirect(new URL(`/metricas?oauth_error=${error}`, "https://panel.mendilore.com"));
  if (!code) return NextResponse.redirect(new URL("/metricas?oauth_error=no_code", "https://panel.mendilore.com"));

  // Intercambiar code por tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });

  if (!tokenRes.ok) {
    const txt = await tokenRes.text();
    return NextResponse.redirect(new URL(`/metricas?oauth_error=${encodeURIComponent(txt.slice(0,100))}`, "https://panel.mendilore.com"));
  }

  const tokens = await tokenRes.json();
  const { access_token, refresh_token, expires_in, scope } = tokens;

  // Obtener email del user via UserInfo
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { "Authorization": `Bearer ${access_token}` }
  });
  const userInfo = await userInfoRes.json();
  const email = userInfo.email;

  // Guardar en BD
  const supabase = createAdminClient();
  const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();
  await supabase.from("ga4_tokens").upsert({
    google_email: email,
    access_token,
    refresh_token: refresh_token || "",
    expires_at,
    scope,
    property_id: GA4_PROPERTY_ID,
    actualizado_en: new Date().toISOString()
  }, { onConflict: "google_email" });

  return NextResponse.redirect(new URL("/metricas?oauth_ok=1", "https://panel.mendilore.com"));
}
