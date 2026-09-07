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

/**
 * Trocea el envío en lotes pequeños.
 *
 * Por qué: el panel corre en Cloudflare Pages (runtime edge) y cada reserva
 * consume 2 subpeticiones (upsert + complementarios). Con 60-70 reservas en un
 * solo POST se supera el límite de subpeticiones del Worker y la mitad del lote
 * se pierde con "Too many subrequests". Con lotes de 15 el consumo queda holgado.
 */
const TAM_LOTE = 15;

export async function postToWebhook(
  url: string,
  secret: string,
  payload: ScraperResult
): Promise<WebhookResponse> {
  const reservas = payload.reservas ?? [];

  if (reservas.length > TAM_LOTE) {
    const lotes: typeof reservas[] = [];
    for (let i = 0; i < reservas.length; i += TAM_LOTE) {
      lotes.push(reservas.slice(i, i + TAM_LOTE));
    }
    log.info(`Troceando ${reservas.length} reservas en ${lotes.length} lotes de ${TAM_LOTE}`);

    let okTodos = true;
    let ultimoStatus = 0;
    const cuerpos: string[] = [];
    let intentosTotales = 0;

    for (let i = 0; i < lotes.length; i++) {
      // Los errores de scraping solo viajan en el primer lote, para no duplicarlos
      const parcial: ScraperResult = {
        ...payload,
        reservas: lotes[i],
        errors: i === 0 ? payload.errors : [],
      };
      const r = await postToWebhook(url, secret, parcial);
      intentosTotales += r.attempts;
      ultimoStatus = r.status;
      cuerpos.push(`[lote ${i + 1}/${lotes.length}] ${r.body.slice(0, 160)}`);
      if (!r.ok) {
        okTodos = false;
        log.warning(`Lote ${i + 1}/${lotes.length} falló (${r.status})`);
      }
      // Respiro entre lotes para no saturar el endpoint
      if (i < lotes.length - 1) await new Promise((res) => setTimeout(res, 500));
    }

    return {
      ok: okTodos,
      status: okTodos ? 200 : ultimoStatus,
      body: cuerpos.join(' | '),
      attempts: intentosTotales,
    };
  }

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
        // 207 = el panel aceptó el lote pero rechazó una parte (ver escalado
        // de errores en el webhook). No es un éxito limpio: hay que verlo.
        if (res.status === 207) {
          log.warning(`Webhook DEGRADADO (207) — ${body.slice(0, 300)}`);
        } else {
          log.info(`Webhook OK (${res.status}) — ${body.slice(0, 200)}`);
        }
        return { ok: res.status !== 207, status: res.status, body, attempts: attempt };
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
