/**
 * Cliente GA4 Data API server-side para Cloudflare Pages edge runtime.
 *
 * Autenticación: Service Account JSON via JWT + OAuth 2.0 token exchange.
 * No usa librerías de Node (la mayoría no funcionan en Workers).
 * Usa Web Crypto API directamente para firmar el JWT.
 *
 * Configuración:
 * - GA4_SA_JSON: env var (Secret) con el contenido completo del JSON
 *   descargado de Google Cloud Console (Service Account key).
 * - GA4_PROPERTY_ID: env var con el ID numérico GA4 (ej "540181854").
 *
 * Uso típico desde un Server Component:
 *   import { runGA4Report } from "@/lib/ga4";
 *   const data = await runGA4Report({
 *     dimensions: ["date"],
 *     metrics: ["sessions", "totalUsers"],
 *     dateRanges: [{ startDate: "30daysAgo", endDate: "today" }]
 *   });
 *
 * Cachea el access token durante 50 min (Google los emite a 1h).
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri: string;
}

interface RunReportRequest {
  dimensions?: { name: string }[] | string[];
  metrics?: { name: string }[] | string[];
  dateRanges?: { startDate: string; endDate: string }[];
  limit?: number;
  orderBys?: any[];
}

interface RunReportResponse {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string; type: string }[];
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  rowCount?: number;
  totals?: any[];
}

// In-memory cache simple del access token (Edge Workers reusan el isolate
// durante la vida del Worker, así que entre requests cercanos esto vale).
let cachedToken: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(input: string | ArrayBuffer): string {
  let str: string;
  if (typeof input === "string") {
    str = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    str = btoa(binary);
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  // 1. Firmar JWT con la clave privada del Service Account
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const keyData = pemToPkcs8(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64UrlEncode(signatureBuf)}`;

  // 2. Intercambiar JWT por access token
  const tokenRes = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`GA4 token exchange failed: ${tokenRes.status} ${text}`);
  }
  const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: tokenData.access_token,
    expiresAt: now + Math.min(tokenData.expires_in - 60, 3000),
  };
  return tokenData.access_token;
}

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.GA4_SA_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
    };
  } catch {
    return null;
  }
}

export function ga4Configured(): boolean {
  return Boolean(process.env.GA4_SA_JSON && process.env.GA4_PROPERTY_ID);
}

export async function runGA4Report(req: RunReportRequest): Promise<RunReportResponse | null> {
  const sa = parseServiceAccount();
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!sa || !propertyId) return null;

  const token = await getAccessToken(sa);

  // Normalizar dimensions/metrics a la shape { name: "..." }
  const dims = (req.dimensions ?? []).map((d) => (typeof d === "string" ? { name: d } : d));
  const mets = (req.metrics ?? []).map((m) => (typeof m === "string" ? { name: m } : m));

  const body = {
    dimensions: dims,
    metrics: mets,
    dateRanges: req.dateRanges ?? [{ startDate: "30daysAgo", endDate: "today" }],
    limit: req.limit ?? 100,
    orderBys: req.orderBys,
  };

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 runReport failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunReportResponse;
}

/**
 * Helper: extrae KPIs principales de visitas para mostrar en /metricas.
 * Devuelve { sesiones, usuarios, paginasPorSesion, duracionMedia, topPaginas, topFuentes, serieDiaria }.
 */
export interface GA4Snapshot {
  sesiones: number;
  usuarios: number;
  pageviews: number;
  bounceRate: number; // 0..1
  // Comparativa 30d previos (60d→30d ago vs 30d→today)
  sesionesPrev: number;
  usuariosPrev: number;
  // Engagement
  engagementRate: number; // 0..1
  sessionDuration: number; // segundos
  // Eventos clave de conversión (configurables vía nombre evento)
  conversiones: { evento: string; total: number }[];
  // Distribución por dispositivo
  dispositivos: { tipo: string; sesiones: number }[];
  // Top países
  paises: { pais: string; sesiones: number }[];
  topPaginas: { ruta: string; views: number }[];
  topFuentes: { fuente: string; sesiones: number }[];
  serieDiaria: { fecha: string; sesiones: number; usuarios: number }[];
}

export async function fetchGA4Snapshot(): Promise<GA4Snapshot | null> {
  if (!ga4Configured()) return null;

  try {
    // 1. KPIs totales 30d + engagement
    const totals = await runGA4Report({
      metrics: ["sessions", "totalUsers", "screenPageViews", "bounceRate", "engagementRate", "averageSessionDuration"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    });
    const tRow = totals?.rows?.[0]?.metricValues ?? [];
    const sesiones = Number(tRow[0]?.value ?? 0);
    const usuarios = Number(tRow[1]?.value ?? 0);
    const pageviews = Number(tRow[2]?.value ?? 0);
    const bounceRate = Number(tRow[3]?.value ?? 0);
    const engagementRate = Number(tRow[4]?.value ?? 0);
    const sessionDuration = Number(tRow[5]?.value ?? 0);

    // 2. Comparativa: 30d previos (días 60..31 atrás)
    const prev = await runGA4Report({
      metrics: ["sessions", "totalUsers"],
      dateRanges: [{ startDate: "60daysAgo", endDate: "31daysAgo" }],
    });
    const pRow = prev?.rows?.[0]?.metricValues ?? [];
    const sesionesPrev = Number(pRow[0]?.value ?? 0);
    const usuariosPrev = Number(pRow[1]?.value ?? 0);

    // 3. Top páginas 30d (mejorado: 10 en lugar de 5)
    const pagesReport = await runGA4Report({
      dimensions: ["pagePath"],
      metrics: ["screenPageViews"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      limit: 10,
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    });
    const topPaginas = (pagesReport?.rows ?? []).map((r) => ({
      ruta: r.dimensionValues[0]?.value ?? "",
      views: Number(r.metricValues[0]?.value ?? 0),
    }));

    // 4. Top fuentes 30d
    const sourcesReport = await runGA4Report({
      dimensions: ["sessionSource"],
      metrics: ["sessions"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      limit: 8,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    });
    const topFuentes = (sourcesReport?.rows ?? []).map((r) => ({
      fuente: r.dimensionValues[0]?.value ?? "",
      sesiones: Number(r.metricValues[0]?.value ?? 0),
    }));

    // 5. Serie diaria 30d (añadimos usuarios además de sesiones)
    const daily = await runGA4Report({
      dimensions: ["date"],
      metrics: ["sessions", "totalUsers"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });
    const serieDiaria = (daily?.rows ?? []).map((r) => ({
      fecha: r.dimensionValues[0]?.value ?? "",
      sesiones: Number(r.metricValues[0]?.value ?? 0),
      usuarios: Number(r.metricValues[1]?.value ?? 0),
    }));

    // 6. Dispositivos 30d
    const devices = await runGA4Report({
      dimensions: ["deviceCategory"],
      metrics: ["sessions"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    });
    const dispositivos = (devices?.rows ?? []).map((r) => ({
      tipo: r.dimensionValues[0]?.value ?? "",
      sesiones: Number(r.metricValues[0]?.value ?? 0),
    })).sort((a, b) => b.sesiones - a.sesiones);

    // 7. Top países 30d
    const countries = await runGA4Report({
      dimensions: ["country"],
      metrics: ["sessions"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      limit: 8,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    });
    const paises = (countries?.rows ?? []).map((r) => ({
      pais: r.dimensionValues[0]?.value ?? "",
      sesiones: Number(r.metricValues[0]?.value ?? 0),
    }));

    // 8. Conversiones (eventos clave) 30d — captura whatsapp_click, click_booking, etc.
    const events = await runGA4Report({
      dimensions: ["eventName"],
      metrics: ["eventCount"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      limit: 15,
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
    });
    // Filtramos a eventos "interesantes" (no page_view ni first_visit ni session_start)
    const eventosBoring = new Set(["page_view", "first_visit", "session_start", "user_engagement", "scroll", "click"]);
    const conversiones = (events?.rows ?? [])
      .map((r) => ({
        evento: r.dimensionValues[0]?.value ?? "",
        total: Number(r.metricValues[0]?.value ?? 0),
      }))
      .filter((e) => !eventosBoring.has(e.evento) && e.total > 0)
      .slice(0, 8);

    return {
      sesiones, usuarios, pageviews, bounceRate,
      sesionesPrev, usuariosPrev,
      engagementRate, sessionDuration,
      conversiones,
      dispositivos,
      paises,
      topPaginas, topFuentes, serieDiaria,
    };
  } catch (err) {
    console.error("GA4 snapshot fetch failed:", err);
    return null;
  }
}
