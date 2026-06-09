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

export async function saveSession(store: KeyValueStore, page: Page, activated = false) {
  const cookies = await page.cookies();
  await store.setValue('cookies', cookies);
  await store.setValue('user-agent', await page.evaluate(() => navigator.userAgent));
  if (activated) await store.setValue('last-activated', new Date().toISOString());
  log.info(`Session saved: ${cookies.length} cookies, activated=${activated}`);
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

export async function needsActivation(page: Page): Promise<boolean> {
  try {
    const txt = await page.evaluate(() => document.body.innerText);
    return /ESTE DISPOSITIVO NO ESTÁ ACTIVADO|activar dispositivo|activation/i.test(txt);
  } catch {
    return false;
  }
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

export async function performLogin(
  page: Page,
  username: string,
  password: string
): Promise<LoginResult> {
  log.info(`Navigating to login page: ${URLS.LOGIN}`);
  await page.goto(URLS.LOGIN, { waitUntil: 'networkidle2', timeout: 30000 });
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
  store: KeyValueStore
): Promise<{ refreshed: boolean }> {
  const session = await loadSession(store);
  await applySession(page, session);

  // Probar primero la HOME — si ya hay sesión válida, evitamos login
  await page.goto(URLS.HOME, { waitUntil: 'networkidle2', timeout: 30000 });

  if (await isLoggedIn(page)) {
    log.info('Session restored from cookies — login skipped');
    return { refreshed: false };
  }

  // Login fresh
  const result = await performLogin(page, username, password);
  if (!result.success) {
    if (result.needsManualActivation) {
      throw new Error(
        'MISTERPLAN_DEVICE_NOT_ACTIVATED: ejecuta el actor en local con headless:false ' +
        'y completa la activación por email. La sesión persistirá en KeyValueStore para runs futuros.'
      );
    }
    throw new Error(`MISTERPLAN_LOGIN_FAILED: ${result.error}`);
  }

  await saveSession(store, page, true);
  return { refreshed: true };
}
