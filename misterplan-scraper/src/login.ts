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

export async function performLogin(
  page: Page,
  username: string,
  password: string
): Promise<LoginResult> {
  log.info('Navigating to login page');
  await page.goto(URLS.LOGIN, { waitUntil: 'networkidle2', timeout: 30000 });

  // Type credentials. Probamos varios selectores por robustez frente a cambios menores
  // del formulario MisterPlan.
  const userSelector = 'input[name="username"], input[placeholder*="Usuario"], input[type="text"]';
  const passSelector = 'input[name="password"], input[placeholder*="Contraseña"], input[type="password"]';

  await page.waitForSelector(userSelector, { timeout: 15000 });
  await page.type(userSelector, username, { delay: 50 });
  await page.type(passSelector, password, { delay: 50 });

  // Submit — botón o Enter
  const submitSelector = 'button[type="submit"], input[type="submit"], button.btn-login';
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
    page.click(submitSelector).catch(() => page.keyboard.press('Enter')),
  ]);

  // Comprobaciones
  if (await needsActivation(page)) {
    log.warning('Device activation required — manual step needed');
    return { success: false, needsManualActivation: true, error: 'Device not activated' };
  }

  if (await isLoggedIn(page)) {
    log.info('Login successful');
    return { success: true, needsManualActivation: false };
  }

  // Buscar mensajes de error visibles
  const errMsg = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('.error, .alert-danger, .login-error, [class*="error"]'));
    const visible = candidates.find((el) => (el as HTMLElement).offsetParent !== null);
    return visible?.textContent?.trim() ?? null;
  });

  return {
    success: false,
    needsManualActivation: false,
    error: errMsg ?? 'Login failed — credentials rejected or unexpected page',
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
