export const runtime = 'edge';
import { NextRequest, NextResponse } from "next/server";

// CLIENT_ID es público en OAuth — va en URL de autorización siempre
const CLIENT_ID = "128611104269-kuenpvc04k4s5aeg0lvp94tk6srv72kn.apps.googleusercontent.com";
const REDIRECT_URI = "https://panel.mendilore.com/api/oauth/google/callback";
const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export async function GET(req: NextRequest) {
  const url = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth"
  );
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return NextResponse.redirect(url.toString());
}
