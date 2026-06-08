/**
 * POST al endpoint /api/webhook/misterplan del panel.
 *
 * Retry exponencial: 3 intentos con backoff 1s, 3s, 9s.
 * Si todos fallan, devuelve el último error pero NO aborta el actor —
 * los datos quedan en el Dataset de Apify y pueden reprocesarse manualmente.
 */

import { log } from 'crawlee';
import type { ScraperResult } from './types.js';

export interface WebhookResponse {
  ok: boolean;
  status: number;
  body: string;
  attempts: number;
}

export async function postToWebhook(
  url: string,
  secret: string,
  payload: ScraperResult
): Promise<WebhookResponse> {
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr = '';

  while (attempt < maxAttempts) {
    attempt++;
    try {
      log.info(`POST webhook attempt ${attempt}/${maxAttempts} → ${url}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-misterplan-secret': secret,
          'User-Agent': 'misterplan-scraper/1.0 (Apify Actor)',
        },
        body: JSON.stringify(payload),
      });
      const body = await res.text();

      if (res.ok) {
        log.info(`Webhook OK (${res.status}) — ${body.slice(0, 200)}`);
        return { ok: true, status: res.status, body, attempts: attempt };
      }

      log.warning(`Webhook returned ${res.status}: ${body.slice(0, 200)}`);
      lastErr = `HTTP ${res.status}: ${body}`;

      // No reintentar en errores 4xx (cliente) — son fatales y reintentar no ayuda
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, body, attempts: attempt };
      }
    } catch (err) {
      lastErr = (err as Error).message;
      log.warning(`Webhook attempt ${attempt} threw: ${lastErr}`);
    }

    // Backoff exponencial
    if (attempt < maxAttempts) {
      const wait = 1000 * Math.pow(3, attempt - 1);
      log.info(`Backing off ${wait}ms before retry`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  return { ok: false, status: 0, body: lastErr, attempts: maxAttempts };
}
