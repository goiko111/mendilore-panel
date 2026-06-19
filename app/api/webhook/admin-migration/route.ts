/**
 * POST /api/webhook/admin-migration
 * Ejecuta SQL en Supabase usando service_role.
 * TEMPORAL — eliminar tras aplicar migrations.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const SUPABASE_URL = "https://itaftpmelcswvphzqgkc.supabase.co";
const ONE_SHOT_SECRET = "mendilore-temp-2026-06-19-apply-migrations-z9k4p2x7q";

export async function POST(req: Request) {
  const secret = req.headers.get("x-admin-secret");
  if (!secret || secret !== ONE_SHOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  }

  let body: { sql?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sql = body.sql;
  if (!sql || typeof sql !== "string") {
    return NextResponse.json({ error: "sql field missing" }, { status: 400 });
  }

  const attempts: any[] = [];
  const endpoints = [
    `${SUPABASE_URL}/pg/meta/default/query`,
    `${SUPABASE_URL}/api/platform/pg-meta/default/query`,
    `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
        },
        body: url.includes("rpc/exec_sql")
          ? JSON.stringify({ sql_query: sql })
          : JSON.stringify({ query: sql }),
      });
      const ct = r.headers.get("content-type") || "";
      const text = await r.text();
      const parsed = ct.includes("json") ? safeJSON(text) : text.slice(0, 500);
      attempts.push({ url: url.replace(SUPABASE_URL, ""), status: r.status, body: parsed });
      if (r.ok) {
        return NextResponse.json({ ok: true, via: url.replace(SUPABASE_URL, ""), result: parsed });
      }
    } catch (e: any) {
      attempts.push({ url: url.replace(SUPABASE_URL, ""), error: String(e?.message ?? e).slice(0, 200) });
    }
  }

  return NextResponse.json({ ok: false, attempts }, { status: 500 });
}

function safeJSON(s: string) {
  try { return JSON.parse(s); } catch { return s.slice(0, 500); }
}
