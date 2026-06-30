export const runtime = 'edge';
import { NextResponse } from "next/server";

// Secret en env var (APIFY_USAGE_SECRET). Fallback al hardcoded mientras se hace el rollover.
const SECRET = process.env.APIFY_USAGE_SECRET || "mendilore-temp-2026-06-22-launch-hist-aBc9X3";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const t = process.env.APIFY_TOKEN;
  if (!t) return NextResponse.json({ error: "no APIFY_TOKEN" });
  const r = await fetch(`https://api.apify.com/v2/users/me/limits?token=${t}`);
  const limits = await r.json();
  const u = await fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${t}`);
  const usage = await u.json();
  return NextResponse.json({ limits: limits?.data, usage: usage?.data });
}
