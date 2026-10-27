/**
 * Login flow para MisterPlan TCloudV2.
 *
 * El login es un form clásico en /experiencias/modulos/TAuthSystem/login.php.
 * MisterPlan implementa "device fingerprint" — si el navegador no está
 * activado, requiere clicar un link de activación enviado por email.
 *
 * Mitigación: persistimos cookies + user-agent en KeyValueStore. La primera
 * activación es manual (Goiko ejecuta el actor una vez con headless:false en
 * Apify local, abre el email, clica activación). A partir de ahí las cookies
 * persisten y los runs siguientes saltan la activación.
 */

import type { Page } from 'puppeteer';
import { KeyValueStore, log } from 'crawlee';

export const URLS = {
  LOGIN: 'https://www.mrplan.es/experiencias/modulos/TAuthSystem/login.php?auth_module=TCloudV2',
  HOME: 'https://www.mrplan.es/scr/modulos/TCloudV2/initInterface.php',
} as const;

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface SessionState {
  cookies: any[];
  userAgent: string;
  lastActivated: string | null;
}

export async function loadSession(store: KeyValueStore): Promise<SessionState> {
  const cookies = (await store.getValue<any[]>('cookies')) ?? [];
  const userAgent = (await store.getValue<string>('user-agent')) ?? DEFAULT_UA;
  const lastActivated = (await store.getValue<string>('last-activated')) ?? null;
  return { cookies, userAgent, lastActivated };
}

/** Dominios donde MisterPlan deja la cookie de sesión. */
const SESSION_ORIGINS = [
  'https://www.mrplan.es',
  'https://mrplan.es',
  'https://cloud.ruralgest.net',
];

export async function saveSession(store: KeyValueStore, page: Page, activated = false) {
  // FIX oct 2026: `page.cookies()` sin argumentos solo devuelve las cookies del
  // URL actual, y está deprecada en Puppeteer 23. Tras el login la sesión vive
  // en www.mrplan.es, pero la página puede estar en otra ruta — y devolvía
  // CERO cookies ("Session saved: 0 cookies"). Resultado: la sesión no se
  // persistía nunca y cada ejecución volvía a toparse con la activación de
  // dispositivo de MisterPlan.
  let cookies: any[] = [];

  // 1) El contexto del navegador devuelve TODAS las cookies, sin depender del URL.
  try {
    const ctx: any = (page as any).browserContext?.();
    if (ctx && typeof ctx.cookies === 'function') {
      cookies = await ctx.cookies();
    }
  } catch (e) {
    log.debug(`browserContext.cookies() no disponible: ${(e as Error).message}`);
  }

  // 2) Respaldo: pedirlas explícitamente por origen.
  if (!cookies.length) {
    try {
      const urls = [...SESSION_ORIGINS];
      const actual = page.url();
      if (actual && actual.startsWith('http')) urls.push(actual);
      cookies = await (page as any).cookies(...urls);
    } catch (e) {
      log.debug(`page.cookies(urls) falló: ${(e as Error).message}`);
    }
  }

  // 3) Último recurso: comportamiento antiguo.
  if (!cookies.length) {
    try { cookies = await page.cookies(); } catch { /* nada más que probar */ }
  }

  await store.setValue('cookies', cookies);
  await store.setValue('user-agent', await page.evaluate(() => navigator.userAgent));
  if (activated) await store.setValue('last-activated', new Date().toISOString());

  if (cookies.length === 0) {
    // Guardar cero cookies es un fallo silencioso: el run parece ir bien y el
    // siguiente vuelve a pedir activación. Que se vea en el log.
    log.warning(
      'Session saved con 0 COOKIES — la sesión no persistirá y el próximo run ' +
      'volverá a pedir activación de dispositivo. Revisar extracción de cookies.',
    );
  } else {
    log.info(`Session saved: ${cookies.length} cookies, activated=${activated}`);
  }
}

export async function applySession(page: Page, session: SessionState) {
  await page.setUserAgent(session.userAgent);
  if (session.cookies?.length) {
    await page.setCookie(...session.cookies);
    log.info(`Restored ${session.cookies.length} cookies (lastActivated=${session.lastActivated ?? 'never'})`);
  }
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    // Heurística: la home renderiza el nombre del establecimiento "Casa Mendilore"
    // o el menú principal con secciones como "Planning", "Tarifas", "Configuración"
    const txt = await page.evaluate(() => document.body.innerText);
    return /Casa Mendilore|Planning|Hospedaje/i.test(txt);
  } catch {
    return false;
  }
}

/**
 * MisterPlan TCloudV2 muestra "loading" como placeholder mientras carga el
 * dashboard real vía AJAX. Si lo vemos como cuerpo, esperamos a que termine.
 * Devuelve true cuando la página ya tiene contenido REAL (no solo "loading").
 */
export async function waitForPostLoginRender(page: Page, timeoutMs = 30000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const t = document.body.innerText.trim().toLowerCase();
        // Considerar listo si el body NO es solo "loading" Y tiene cierto contenido
        return t.length > 30 && !/^loading\s*\.*$/i.test(t);
      },
      { timeout: timeoutMs, polling: 500 }
    );
    return true;
  } catch {
    return false;
  }
}

export async function needsActivation(page: Page): Promise<boolean> {
  try {
    const txt = await page.evaluate(() => document.body.innerText);
    return /ESTE DISPOSITIVO NO ESTÁ ACTIVADO|activar dispositivo|activation/i.test(txt);
  } catch {
    return false;
  }
}

/**
 * Mantiene vivo el mismo navegador que solicitó la activación. MisterPlan liga
 * el enlace del email a esa sesión; si el actor cierra Chrome antes del clic,
 * el enlace responde con el código 7 y no puede autorizar el dispositivo.
 */
const DEVICE_ACTIVATION_URL_KEY = 'device-activation-url';

function isAllowedActivationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'mrplan.io' &&
      url.pathname === '/experiencias/modulos/TBrowserAuth/lib/linkBrowserAuth.php'
    );
  } catch {
    return false;
  }
}

async function waitForDeviceActivation(
  page: Page,
  store: KeyValueStore,
  proxyCredentials?: { username: string; password: string },
  timeoutMs = 10 * 60_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  const checkIntervalMs = 5_000;

  log.warning(`Waiting up to ${Math.round(timeoutMs / 60_000)} minutes for device activation`);

  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    await new Promise((resolve) => setTimeout(resolve, Math.min(checkIntervalMs, remainingMs)));
    attempt += 1;

    try {
      // Residential proxy sessions can be reassigned after a quiet period. A
      // small same-origin request keeps the exact browser/proxy path that asked
      // MisterPlan for activation alive while the email is being delivered.
      if (attempt % 3 === 0) {
        await page.evaluate(async () => {
          try {
            await fetch(`/favicon.ico?activation_keepalive=${Date.now()}`, {
              cache: 'no-store',
              credentials: 'include',
            });
          } catch {
            // The activation page remains authoritative; keepalive failures are
            // harmless and must not interrupt polling the KVS.
          }
        });
      }

      const rawActivationUrl = await store.getValue<string | Buffer>(DEVICE_ACTIVATION_URL_KEY);
      const activationUrl =
        typeof rawActivationUrl === 'string'
          ? rawActivationUrl.trim()
          : Buffer.isBuffer(rawActivationUrl)
            ? rawActivationUrl.toString('utf8').trim()
            : '';
      if (!activationUrl) {
        if (attempt % 12 === 0) {
          log.info(`Still waiting for the MisterPlan activation link (${Math.round(attempt * checkIntervalMs / 60_000)} min)`);
        }
        continue;
      }

      // Consume the one-time link before navigating so it is never retried or
      // left in the store. Never log the URL because it contains a token.
      await store.setValue(DEVICE_ACTIVATION_URL_KEY, null);
      if (!isAllowedActivationUrl(activationUrl)) {
        log.warning('Ignored an invalid device activation URL');
        continue;
      }

      // Keep the page that requested activation open. MisterPlan invalidates
      // the pending browser authorization if that page is replaced before the
      // email link is consumed, so the link must open in a sibling tab.
      log.info('Opening the device activation link in a new tab of the requesting browser');
      const requestingIp = await page.evaluate(async () => {
        try {
          const response = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
          return ((await response.json()) as { ip?: string }).ip ?? null;
        } catch {
          return null;
        }
      });
      const activationPage = await page.browser().newPage();
      try {
        if (proxyCredentials) await activationPage.authenticate(proxyCredentials);
        await activationPage.setUserAgent(await page.evaluate(() => navigator.userAgent));
        const viewport = page.viewport();
        if (viewport) await activationPage.setViewport(viewport);
        await activationPage.goto('https://api.ipify.org?format=json', {
          waitUntil: 'networkidle2',
          timeout: 15_000,
        });
        const activationIp = await activationPage.evaluate(() => {
          try {
            return (JSON.parse(document.body.innerText) as { ip?: string }).ip ?? null;
          } catch {
            return null;
          }
        });
        log.info(
          `Activation proxy continuity: ${requestingIp && activationIp
            ? requestingIp === activationIp ? 'same IP' : 'IP changed'
            : 'unverified'}`
        );
        await activationPage.goto(activationUrl, { waitUntil: 'networkidle2', timeout: 30_000 });

        const activationText = await activationPage.evaluate(() => document.body.innerText);
        if (/C[oó]digo del error|Ha habido un error/i.test(activationText)) {
          const errorCode = activationText.match(/C[oó]digo del error\D*(\d+)/i)?.[1] ?? 'unknown';
          log.warning(`MisterPlan activation page reported an error (code=${errorCode}); verifying the session anyway`);
        }
      } finally {
        await activationPage.close().catch(() => null);
      }

      await page.goto(URLS.HOME, { waitUntil: 'networkidle2', timeout: 30_000 });
      await waitForPostLoginRender(page, 20_000);

      if (await isLoggedIn(page)) {
        log.info('Device activation confirmed; continuing in the authenticated session');
        return true;
      }

      log.warning('Activation link opened, but MisterPlan did not create an authenticated session');
    } catch (err) {
      log.warning(`Activation check failed; retrying: ${(err as Error).message}`);
    }
  }

  return false;
}

export interface LoginResult {
  success: boolean;
  needsManualActivation: boolean;
  error?: string;
}

async function dumpDebug(page: Page, label: string) {
  try {
    const store = await KeyValueStore.open('debug-screenshots');
    const ts = Date.now();
    const png = await page.screenshot({ fullPage: true, type: 'png' });
    await store.setValue(`${label}-${ts}.png`, png, { contentType: 'image/png' });
    const html = await page.content();
    await store.setValue(`${label}-${ts}.html`, html, { contentType: 'text/html' });
    const url = page.url();
    await store.setValue(`${label}-${ts}.txt`, `URL: ${url}\nTITLE: ${await page.title()}`, { contentType: 'text/plain' });
    log.info(`Debug saved as ${label}-${ts}.* (url=${url})`);
  } catch (e: any) {
    log.warning(`Debug dump failed: ${e.message}`);
  }
}

/**
 * Navegación tolerante. MisterPlan mantiene conexiones abiertas y, a través
 * del proxy residencial, `networkidle2` a veces no llega en 30 s: el run
 * entero moría en la primera carga. Se espera solo al DOM (más el render que
 * ya se comprueba aparte) y se reintenta con más margen.
 */
async function irA(page: Page, url: string): Promise<void> {
  let ultimo: unknown = null;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 + 15_000 * intento });
      return;
    } catch (e) {
      ultimo = e;
      log.warning(`Carga de ${url} falló (intento ${intento}): ${(e as Error).message.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 2000 * intento));
    }
  }
  throw ultimo;
}

export async function performLogin(
  page: Page,
  username: string,
  password: string
): Promise<LoginResult> {
  log.info(`Navigating to login page: ${URLS.LOGIN}`);
  await irA(page, URLS.LOGIN);
  await dumpDebug(page, 'login-01-arrived');

  const finalUrl = page.url();
  const pageTitle = await page.title();
  log.info(`Login page arrived · url=${finalUrl} · title=${pageTitle}`);

  // Inspeccionar qué inputs hay en la página
  const inputsFound = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map((i) => ({
      name: i.name,
      type: i.type,
      id: i.id,
      placeholder: i.placeholder,
      visible: (i as HTMLElement).offsetParent !== null,
    }));
  });
  log.info(`Inputs found on page: ${JSON.stringify(inputsFound)}`);

  // Type credentials. Probamos varios selectores por robustez.
  const userSelector = 'input[name="username"], input[name="user"], input[name="login"], input[name="email"], input[placeholder*="Usuario"], input[placeholder*="usuario"], input[type="text"]:not([type="hidden"])';
  const passSelector = 'input[name="password"], input[name="pass"], input[placeholder*="Contraseña"], input[placeholder*="contraseña"], input[type="password"]';

  try {
    await page.waitForSelector(userSelector, { timeout: 15000 });
  } catch (err) {
    log.error('No username field found');
    await dumpDebug(page, 'login-02-no-user-field');
    return {
      success: false,
      needsManualActivation: false,
      error: `No username field found. URL=${finalUrl} Title=${pageTitle}`,
    };
  }

  await page.type(userSelector, username, { delay: 50 });
  log.info('Username typed');
  await page.type(passSelector, password, { delay: 50 });
  log.info('Password typed');
  await dumpDebug(page, 'login-03-credentials-typed');

  // Submit
  const submitSelector = 'button[type="submit"], input[type="submit"], button.btn-login, button:has-text("Iniciar"), button:has-text("Entrar"), button.btn-primary';
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
    page.click(submitSelector).catch(() => page.keyboard.press('Enter')),
  ]);
  await dumpDebug(page, 'login-04-after-submit');

  const postUrl = page.url();
  const postTitle = await page.title();
  log.info(`Post-submit · url=${postUrl} · title=${postTitle}`);

  // Esperar a que la página post-login renderice contenido real (no "loading")
  // MisterPlan TCloudV2 carga el dashboard vía AJAX tras la navegación inicial.
  const renderedOk = await waitForPostLoginRender(page, 30000);
  log.info(`Post-login render wait: ${renderedOk ? 'OK' : 'TIMEOUT'}`);
  if (renderedOk) {
    await dumpDebug(page, 'login-04b-post-render');
  }

  // Comprobaciones
  if (await needsActivation(page)) {
    log.warning('Device activation required — manual step needed');
    await dumpDebug(page, 'login-05-needs-activation');
    return { success: false, needsManualActivation: true, error: 'Device not activated' };
  }

  if (await isLoggedIn(page)) {
    log.info('Login successful');
    return { success: true, needsManualActivation: false };
  }

  // Buscar mensajes de error visibles + body text para debug
  const diagnostic = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('.error, .alert-danger, .login-error, .alert, [class*="error"], [class*="invalid"]'));
    const visible = candidates.find((el) => (el as HTMLElement).offsetParent !== null);
    const bodyText = document.body.innerText.substring(0, 500);
    return {
      errorMsg: visible?.textContent?.trim() ?? null,
      bodyText,
    };
  });
  log.error(`Login failed. Visible error: ${diagnostic.errorMsg}. Body preview: ${diagnostic.bodyText}`);
  await dumpDebug(page, 'login-06-failed');

  return {
    success: false,
    needsManualActivation: false,
    error: diagnostic.errorMsg ?? `Login failed at ${postUrl} (title: ${postTitle})`,
  };
}

export async function ensureLoggedIn(
  page: Page,
  username: string,
  password: string,
  store: KeyValueStore,
  proxyCredentials?: { username: string; password: string }
): Promise<{ refreshed: boolean }> {
  const session = await loadSession(store);
  await applySession(page, session);

  // Probar primero la HOME — si ya hay sesión válida, evitamos login
  await irA(page, URLS.HOME);
  // Esperar a que el dashboard renderice (igual que en performLogin)
  await waitForPostLoginRender(page, 20000);

  if (await isLoggedIn(page)) {
    log.info('Session restored from cookies — login skipped');
    return { refreshed: false };
  }

  // Login fresh
  // A previous one-time link must never be reused for a fresh login attempt.
  await store.setValue(DEVICE_ACTIVATION_URL_KEY, null);

  // Hasta 3 intentos ante errores TRANSITORIOS de Puppeteer. Al pulsar
  // "Acceso" la página navega, y si en ese instante se está evaluando algo
  // salta "Execution context was destroyed". Pasó el 27/10/2026 en una
  // ejecución de prueba: el run entero se perdía por un fallo de un segundo.
  // Antes de reintentar se comprueba si el primer envío ya había entrado.
  const transitorio = (m: string) =>
    /Execution context was destroyed|detached|Target closed|Not attached|navigation|frame was detached/i.test(m);
  for (let intento = 1; ; intento++) {
    try {
      const result = await performLogin(page, username, password);
      if (!result.success) {
        if (result.needsManualActivation) {
          if (await waitForDeviceActivation(page, store, proxyCredentials)) {
            await saveSession(store, page, true);
            return { refreshed: true };
          }
          throw new Error(
            'MISTERPLAN_DEVICE_NOT_ACTIVATED: el enlace no se completó durante los 10 minutos ' +
            'en que el actor mantuvo abierta la sesión. Ejecuta de nuevo y abre el email inmediatamente.'
          );
        }
        throw new Error(`MISTERPLAN_LOGIN_FAILED: ${result.error}`);
      }
      await saveSession(store, page, true);
      return { refreshed: true };
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (intento >= 3 || !transitorio(msg)) throw e;
      log.warning(`Login intento ${intento} interrumpido (${msg.slice(0, 120)}) — reintento`);
      await new Promise((r) => setTimeout(r, 3000 * intento));
      try {
        await irA(page, URLS.HOME);
        await waitForPostLoginRender(page, 20000);
        if (await isLoggedIn(page)) {
          log.info('El envío anterior sí había entrado: sesión iniciada');
          await saveSession(store, page, true);
          return { refreshed: true };
        }
      } catch { /* se reintenta el login completo */ }
    }
  }
}
