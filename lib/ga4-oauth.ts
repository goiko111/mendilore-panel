const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

export async function getValidAccessToken(supabase: any): Promise<{ token: string; property_id: string } | null> {
  const { data: tokens } = await supabase.from("ga4_tokens").select("*").limit(1).maybeSingle();
  if (!tokens) return null;

  // Si quedan más de 60s antes de expirar, usar directo
  const expiresAt = new Date(tokens.expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return { token: tokens.access_token, property_id: tokens.property_id };
  }

  // Refrescar
  if (!tokens.refresh_token) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) return null;
  const d = await res.json();
  const new_expires = new Date(Date.now() + d.expires_in * 1000).toISOString();
  await supabase.from("ga4_tokens").update({
    access_token: d.access_token,
    expires_at: new_expires,
    actualizado_en: new Date().toISOString()
  }).eq("id", tokens.id);
  return { token: d.access_token, property_id: tokens.property_id };
}

export async function ga4RunReport(token: string, propertyId: string, body: any) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GA4 API ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

export async function fetchGA4Snapshot(supabase: any) {
  const auth = await getValidAccessToken(supabase);
  if (!auth) return null;

  // 28 días atrás → hoy
  const reqs: any = {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    metrics: [
      { name: "sessions" }, { name: "totalUsers" },
      { name: "screenPageViews" }, { name: "averageSessionDuration" }
    ]
  };
  const totals = await ga4RunReport(auth.token, auth.property_id, reqs);
  const row = totals.rows?.[0]?.metricValues ?? [];

  // Top páginas
  const topPaginasRes = await ga4RunReport(auth.token, auth.property_id, {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    limit: 10,
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }]
  });

  // Top fuentes
  const topFuentesRes = await ga4RunReport(auth.token, auth.property_id, {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    dimensions: [{ name: "sessionSource" }],
    metrics: [{ name: "sessions" }],
    limit: 8,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
  });

  return {
    sesiones: Number(row[0]?.value ?? 0),
    usuarios: Number(row[1]?.value ?? 0),
    pageviews: Number(row[2]?.value ?? 0),
    duracionMedia: Number(row[3]?.value ?? 0),
    topPaginas: (topPaginasRes.rows ?? []).map((r: any) => ({
      ruta: r.dimensionValues?.[0]?.value ?? "",
      views: Number(r.metricValues?.[0]?.value ?? 0)
    })),
    topFuentes: (topFuentesRes.rows ?? []).map((r: any) => ({
      fuente: r.dimensionValues?.[0]?.value ?? "",
      sesiones: Number(r.metricValues?.[0]?.value ?? 0)
    }))
  };
}
