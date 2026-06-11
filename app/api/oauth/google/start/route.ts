export const runtime = 'edge';

import { NextResponse } from "next/server";

const CLIENT_ID = "128611104269-kuenpvc04k4s5aeg0lvp94tk6srv72kn.apps.googleusercontent.com";
const REDIRECT_URI = "https://panel.mendilore.com/api/oauth/google/callback";
const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/userinfo.email"];

export async function GET() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent"
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
