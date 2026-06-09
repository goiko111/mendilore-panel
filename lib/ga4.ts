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
  topPaginas: { ruta: string; views: number }[];
  topFuentes: { fuente: string; sesiones: number }[];
  serieDiaria: { fecha: string; sesiones: number }[];
}

export async function fetchGA4Snapshot(): Promise<GA4Snapshot | null> {
  if (!ga4Configured()) return null;

  try {
    // 1. KPIs totales 30d
    const totals = await runGA4Report({
      metrics: ["sessions", "totalUsers", "screenPageViews", "bounceRate"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
    });

    const tRow = totals?.rows?.[0]?.metricValues ?? [];
    const sesiones = Number(tRow[0]?.value ?? 0);
    const usuarios = Number(tRow[1]?.value ?? 0);
    const pageviews = Number(tRow[2]?.value ?? 0);
    const bounceRate = Number(tRow[3]?.value ?? 0);

    // 2. Top páginas 30d
    const pagesReport = await runGA4Report({
      dimensions: ["pagePath"],
      metrics: ["screenPageViews"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      limit: 5,
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    });
    const topPaginas = (pagesReport?.rows ?? []).map((r) => ({
      ruta: r.dimensionValues[0]?.value ?? "",
      views: Number(r.metricValues[0]?.value ?? 0),
    }));

    // 3. Top fuentes 30d
    const sourcesReport = await runGA4Report({
      dimensions: ["sessionSource"],
      metrics: ["sessions"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      limit: 5,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    });
    const topFuentes = (sourcesReport?.rows ?? []).map((r) => ({
      fuente: r.dimensionValues[0]?.value ?? "",
      sesiones: Number(r.metricValues[0]?.value ?? 0),
    }));

    // 4. Serie diaria 30d
    const daily = await runGA4Report({
      dimensions: ["date"],
      metrics: ["sessions"],
      dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    });
    const serieDiaria = (daily?.rows ?? []).map((r) => ({
      fecha: r.dimensionValues[0]?.value ?? "",
      sesiones: Number(r.metricValues[0]?.value ?? 0),
    }));

    return { sesiones, usuarios, pageviews, bounceRate, topPaginas, topFuentes, serieDiaria };
  } catch (err) {
    // Si la conexión GA4 falla, mejor devolver null y que el caller muestre placeholder
    // que romper la página entera.
    console.error("GA4 snapshot fetch failed:", err);
    return null;
  }
}
