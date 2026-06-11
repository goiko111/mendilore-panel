export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const CLIENT_ID = "128611104269-kuenpvc04k4s5aeg0lvp94tk6srv72kn.apps.googleusercontent.com";
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
const REDIRECT_URI = "https://panel.mendilore.com/api/oauth/google/callback";
const GA4_PROPERTY_ID = "540181854";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }
  if (!CLIENT_SECRET) {
    return NextResponse.json({
      error: "missing_secret_env_var",
      hint: "Configura GOOGLE_OAUTH_CLIENT_SECRET en Cloudflare Pages env vars (Secret)"
    }, { status: 500 });
  }

  // 1) Intercambiar code por tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    return NextResponse.json({ error: "token_exchange_failed", detail: t }, { status: 500 });
  }
  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };

  // 2) Obtener email del usuario
  const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) {
    return NextResponse.json({ error: "userinfo_failed" }, { status: 500 });
  }
  const me = await meRes.json() as { email: string };

  // 3) Guardar tokens en ga4_tokens
  if (!tokens.refresh_token) {
    return NextResponse.json({
      error: "no_refresh_token",
      hint: "Revoca acceso previo en https://myaccount.google.com/permissions y reintenta"
    }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("ga4_tokens")
    .upsert({
      google_email: me.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      property_id: GA4_PROPERTY_ID,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "google_email" });

  if (error) {
    return NextResponse.json({ error: "db_save_failed", detail: error.message }, { status: 500 });
  }

  // 4) Redirigir a /metricas con flag éxito
  return NextResponse.redirect("https://panel.mendilore.com/metricas?ga4=connected");
}
