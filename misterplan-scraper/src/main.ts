/**
 * Apify Actor — MisterPlan Reservas Scraper
 *
 * Flujo:
 *   1. Init Apify SDK
 *   2. Validar input (username/password/webhookSecret obligatorios)
 *   3. Lanzar Puppeteer con session persistida
 *   4. Login (o restore desde cookies)
 *   5. Scrape planning monthsBack..monthsAhead
 *   6. POST resultado al webhook del panel con retry
 *   7. Push al Dataset Apify para retención
 *   8. Exit code != 0 si webhook falló (Apify lo marca como FAILED y dispara
 *      la alerta de email del schedule)
 *
 * Idempotencia: cada reserva tiene un `id_reserva` único de MisterPlan que el
 * webhook usa como clave de UPSERT — re-ejecutar el actor no duplica datos.
 *
 * Frecuencia recomendada: cada hora durante el día (08:00-22:00 Madrid),
 * cada 2h durante la noche. Se configura en Apify Schedule.
 */

import { Actor, log } from 'apify';
import { KeyValueStore } from 'crawlee';
import puppeteer from 'puppeteer';

import type { ActorInput, ReservaScraped, ScrapingError, ScraperResult } from './types.js';
import { ensureLoggedIn } from './login.js';
import { scrapePlanning } from './scrape-planning.js';
import { postToWebhook } from './webhook.js';

const DEFAULT_WEBHOOK_URL = 'https://panel.mendilore.com/api/webhook/misterplan';

async function main() {
  await Actor.init();

  const input = (await Actor.getInput<ActorInput>()) ?? {} as ActorInput;
  const {
    username,
    password,
    webhookUrl = DEFAULT_WEBHOOK_URL,
    webhookSecret,
    monthsAhead = 2, // sync horario: mes actual + siguiente (cabe en el timeout de 300s)
    monthsBack = 0,
    headless = true,
    debug = false,
  } = input;

  if (!username || !password || !webhookSecret) {
    throw new Error('Missing required input: username, password, webhookSecret');
  }

  log.setLevel(debug ? log.LEVELS.DEBUG : log.LEVELS.INFO);
  log.info(`Starting MisterPlan scraper · monthsBack=${monthsBack} monthsAhead=${monthsAhead} headless=${headless}`);

  const sessionStore = await KeyValueStore.open('misterplan-session');
  const screenshotsStore = debug ? await KeyValueStore.open('debug-screenshots') : null;

  const errors: ScrapingError[] = [];
  let reservas: ReservaScraped[] = [];
  let sessionRefreshed = false;

  // Chrome path: Apify image lo tiene en /usr/bin/google-chrome, también respeta APIFY_CHROME_EXECUTABLE_PATH y PUPPETEER_EXECUTABLE_PATH
  const chromePath =
    process.env.APIFY_CHROME_EXECUTABLE_PATH ||
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    '/usr/bin/google-chrome';
  log.info(`Launching Chrome from: ${chromePath}`);

  const browser = await puppeteer.launch({
    headless,
    executablePath: chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Login (o restore)
    try {
      const result = await ensureLoggedIn(page, username, password, sessionStore);
      sessionRefreshed = result.refreshed;
    } catch (err) {
      log.error(`Login failed: ${(err as Error).message}`);
      errors.push({ step: 'login', error: (err as Error).message });
      throw err;  // sin login no hay scrape
    }

    // Scrape
    try {
      // Persistir incrementalmente por mes: si el run muere, los meses ya
      // completados quedan en BD.
      const result = await scrapePlanning(page, {
        monthsAhead,
        monthsBack,
        debug,
        saveScreenshot: screenshotsStore
          ? async (name, buf) => screenshotsStore.setValue(name, buf, { contentType: 'image/png' })
          : undefined,
        onMonthComplete: async (monthReservas, mIdx, totalM) => {
          if (monthReservas.length === 0) {
            log.info(`Month ${mIdx + 1}/${totalM} · 0 reservas, skipping webhook`);
            return;
          }
          const monthPayload: ScraperResult = {
            source: 'misterplan',
            scrapedAt: new Date().toISOString(),
            monthsScraped: 1,
            reservas: monthReservas,
            errors: [],
            sessionRefreshed: false,
          };
          const wh = await postToWebhook(webhookUrl, webhookSecret, monthPayload);
          if (wh.ok) {
            log.info(`  ✓ Month ${mIdx + 1}/${totalM} persisted (${monthReservas.length} reservas)`);
          } else {
            log.warning(`  ✗ Month ${mIdx + 1}/${totalM} webhook fail HTTP ${wh.status} — reservas quedarán en el batch final`);
          }
        },
      });
      reservas = result.reservas;
      errors.push(...result.errors);
      log.info(`Scraped ${reservas.length} reservas across ${result.monthsScraped} months · ${result.errors.length} errors`);
    } catch (err) {
      log.error(`Scraping failed: ${(err as Error).message}`);
      errors.push({ step: 'scrapePlanning', error: (err as Error).message });
    }
  } finally {
    await browser.close().catch(() => null);
  }

  // Construir payload
  const payload: ScraperResult = {
    source: 'misterplan',
    scrapedAt: new Date().toISOString(),
    monthsScraped: monthsBack + monthsAhead,
    reservas,
    errors,
    sessionRefreshed,
  };

  // Guardar en Apify Dataset SIEMPRE (aunque webhook falle)
  await Actor.pushData({
    scrapedAt: payload.scrapedAt,
    count: reservas.length,
    errors: errors.length,
    reservas: debug ? reservas : reservas.slice(0, 3),  // sin debug solo guardamos 3 para no inflar el dataset
  });

  // POST webhook
  const wh = await postToWebhook(webhookUrl, webhookSecret, payload);
  if (!wh.ok) {
    log.error(`Webhook delivery failed after ${wh.attempts} attempts: ${wh.body.slice(0, 300)}`);
    // Apify marca el actor como FAILED → dispara la alerta de email del schedule
    await Actor.fail(`Webhook failed: HTTP ${wh.status}`);
    return;
  }

  log.info(`✓ Run complete · ${reservas.length} reservas · ${errors.length} errors · session refreshed=${sessionRefreshed}`);
  await Actor.exit();
}

main().catch(async (err) => {
  log.exception(err as Error, 'Fatal error in main');
  await Actor.fail((err as Error).message);
});


