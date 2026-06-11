export const runtime = 'edge';
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getValidAccessToken, ga4RunReport } from "@/lib/ga4-oauth";

export async function GET() {
  const supabase = createAdminClient();
  const auth = await getValidAccessToken(supabase);
  if (!auth) return NextResponse.json({ error: "no_token" }, { status: 500 });

  const out: any = { property_id: auth.property_id };

  // Probar con varios rangos
  try {
    const r1 = await ga4RunReport(auth.token, auth.property_id, {
      dateRanges: [{ startDate: "365daysAgo", endDate: "today" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }]
    });
    out.range365d = { rows: r1.rows, totals: r1.totals, rowCount: r1.rowCount };
  } catch (e: any) {
    out.range365d_error = String(e);
  }

  try {
    const r2 = await ga4RunReport(auth.token, auth.property_id, {
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      metrics: [{ name: "sessions" }]
    });
    out.range28d = { rows: r2.rows, totals: r2.totals };
  } catch (e: any) {
    out.range28d_error = String(e);
  }

  // Listar properties accesibles para el token
  try {
    const r3 = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    out.accountSummariesStatus = r3.status;
    if (r3.ok) out.accountSummaries = await r3.json();
    else out.accountSummariesError = (await r3.text()).slice(0, 500);
  } catch (e: any) {
    out.accountSummariesException = String(e);
  }

  return NextResponse.json(out);
}
