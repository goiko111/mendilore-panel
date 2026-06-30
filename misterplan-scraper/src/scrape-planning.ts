/**
 * Scraping del Planning de MisterPlan.
 *
 * Estructura (recon D-132):
 *   - Iframe principal con vista funcional
 *   - 32 elementos `.reserva` visibles sin scroll (resto via scroll horizontal)
 *   - Header con botones `< Mes anterior` `Mes actual` `> Mes siguiente`
 *   - Cada reserva tiene un atributo data-* con el ID o link "Abrir Reserva"
 *
 * Estrategia:
 *   1. Esperar a que el iframe cargue
 *   2. Para cada mes 0..monthsAhead-1: hacer click en `>` para avanzar, scrape
 *   3. Por cada `.reserva`, click → click "Abrir Reserva" → esperar modal → parseModal
 *   4. Cerrar modal, siguiente reserva
 *
 * Robustez:
 *   - Si un click falla, log warning y continuar (no abortar todo el run)
 *   - Si el modal no aparece en 5s, marcar error pero seguir
 *   - Si MisterPlan invalida sesión a mitad de run, intentar re-login una vez
 */

import type { Page, Frame } from 'puppeteer';
import { log } from 'crawlee';
import type { ReservaScraped, ScrapingError } from './types.js';
import { parseModalReserva } from './parse-modal.js';

export interface ScrapeOptions {
  monthsAhead: number;
  monthsBack: number;
  debug?: boolean;
  /** Callback para guardar screenshots de debugging */
  saveScreenshot?: (name: string, buffer: Buffer) => Promise<void>;
}

export interface ScrapeResult {
  reservas: ReservaScraped[];
  errors: ScrapingError[];
  monthsScraped: number;
}

/**
 * Obtiene el frame principal donde vive el planning.
 * MisterPlan TCloudV2 usa exactamente 1 iframe principal.
 */
async function getMainFrame(page: Page): Promise<Frame> {
  // Wait for at least one frame other than main to exist
  await page.waitForFunction(() => document.querySelectorAll('iframe').length > 0, { timeout: 15000 })
    .catch(() => null);

  const frames = page.frames();
  // Elegimos el frame cuyo URL contenga TCloudV2
  const cloud = frames.find((f) => /TCloudV2/i.test(f.url())) ?? frames[1] ?? frames[0];
  if (!cloud) throw new Error('No iframe found in MisterPlan home');
  return cloud;
}

/** Navegar al Planning desde el menú principal o desde el dashboard */
async function gotoPlanning(page: Page, frame: Frame): Promise<Frame> {
  log.info('Navigating to Planning section');

  // 1. Buscar por texto exacto "Planning" en cualquier elemento clicable
  //    (la home post-login muestra menú lateral con items + botón "Ir al Planning")
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('a, button, li, div, span'));
    for (const el of candidates) {
      const txt = (el.textContent || '').trim();
      if (/^(Ir al Planning|Planning)$/i.test(txt)) {
        const target = el.closest('a, button, li, [onclick], [data-href]') || el;
        (target as HTMLElement).click();
        return { found: true, text: txt, tag: el.tagName };
      }
    }
    return { found: false };
  });
  log.info(`Planning click result: ${JSON.stringify(clicked)}`);

  // Esperar navegación o cambio de iframe
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null);
  await new Promise((r) => setTimeout(r, 2000));

  // También intentar en el frame por si hace falta
  if (!clicked.found) {
    try {
      await frame.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('a, button, li, div, span'));
        for (const el of candidates) {
          const txt = (el.textContent || '').trim();
          if (/^(Ir al Planning|Planning)$/i.test(txt)) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
    } catch {
      // ignore
    }
  }

  if (!clicked.found) {
    log.warning('Could not find Planning menu link — assuming we are already in Planning view');
  }

  // Re-fetch frame after navigation in case it reloaded
  await page.waitForNetworkIdle({ idleTime: 1000, timeout: 15000 }).catch(() => null);
  return getMainFrame(page);
}

/** Hace click en el botón siguiente mes del header del Planning */
async function clickNextMonth(frame: Frame): Promise<boolean> {
  const candidates = [
    'button[title*="siguiente"], button[aria-label*="siguiente"]',
    '.fc-next-button',  // FullCalendar
    '.btn-next-month',
    'a.next',
  ];
  for (const sel of candidates) {
    try {
      await frame.click(sel, { delay: 50 });
      return true;
    } catch { /* try next */ }
  }
  return false;
}

async function clickPrevMonth(frame: Frame): Promise<boolean> {
  // Lista exhaustiva de selectores comunes en calendars/datepickers
  const candidates = [
    'button[title*="anterior" i], button[aria-label*="anterior" i]',
    'button[title*="previous" i], button[aria-label*="previous" i]',
    'button[title*="prev" i], button[aria-label*="prev" i]',
    '.fc-prev-button',
    '.btn-prev-month, .btn-prev',
    'a.prev, a[data-action="prev"], a[data-direction="prev"]',
    '[data-action="prev-month"], [data-action="prevMonth"]',
    'button.flecha-izq, .arrow-left, .icon-arrow-left',
    'i.fa-chevron-left, i.fa-arrow-left, i.fa-angle-left',
    'span.flecha-anterior',
    '#prev, #prev-month, #btnAnterior, #btn-anterior',
  ];
  for (const sel of candidates) {
    try {
      const el = await frame.$(sel);
      if (el) {
        await el.click({ delay: 50 });
        return true;
      }
    } catch { /* try next */ }
  }
  // Fallback: buscar por texto del botón (← < anterior previa ant)
  try {
    const result = await frame.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('button, a, span, div')) as HTMLElement[];
      const candidate = cands.find((el) => {
        const t = (el.textContent || '').trim().toLowerCase();
        const cl = (el.className || '').toString().toLowerCase();
        const id = (el.id || '').toLowerCase();
        // Símbolos clave del botón anterior
        if (t === '<' || t === '‹' || t === '←' || t === '«' || t === '<<') return true;
        if (/^(anterior|previa|prev|atrás|atras)\b/i.test(t)) return true;
        if (/prev|anterior|atras|left|izq/.test(cl + ' ' + id) && (el as HTMLElement).offsetParent !== null) return true;
        return false;
      });
      if (candidate) {
        // Si es un icono dentro de un botón, clickear el padre
        const target = candidate.tagName === 'I' || candidate.tagName === 'SPAN' ? candidate.closest('button, a') as HTMLElement || candidate : candidate;
        target.click();
        return { ok: true, tag: target.tagName, text: target.textContent?.slice(0, 30), cls: target.className?.slice(0, 60) };
      }
      return { ok: false };
    });
    if (result.ok) {
      log.info(`Prev month clicked via text/class search: ${JSON.stringify(result)}`);
      return true;
    }
  } catch (e: any) {
    log.warning(`Prev month text search failed: ${e.message}`);
  }
  // Último fallback: dump del HTML para diagnóstico
  try {
    const html = await frame.evaluate(() => document.documentElement.outerHTML.slice(0, 50000));
    const KeyValueStore = (await import('crawlee')).KeyValueStore;
    const store = await KeyValueStore.open('debug-screenshots');
    await store.setValue(`planning-html-${Date.now()}.html`, html, { contentType: 'text/html' });
    log.info('Planning HTML dumped to debug-screenshots for selector inspection');
  } catch {}
  return false;
}

/** Devuelve los handles de elementos .reserva visibles en el frame actual */
async function getReservaHandles(frame: Frame) {
  // Los selectores son aproximados — el recon detectó class="reserva".
  // Probamos varias variantes para robustez.
  const selectorVariants = [
    '.reserva-bar',
    '.reserva',
    '[class*="reserva-"]',
    '[data-tipo="reserva"]',
  ];
  for (const sel of selectorVariants) {
    const handles = await frame.$$(sel);
    if (handles.length > 0) {
      log.info(`Found ${handles.length} reservas via selector "${sel}"`);
      return handles;
    }
  }
  return [];
}

/**
 * Click en una reserva → click en "Abrir Reserva" → esperar modal.
 * Devuelve true si el modal está visible, false si algo falló.
 */
async function openReservaModal(frame: Frame, idx: number, debug = false): Promise<boolean> {
  // Re-fetch handles cada vez para evitar handles obsoletos tras mutaciones del DOM
  const handles = await getReservaHandles(frame);
  if (idx >= handles.length) return false;
  const handle = handles[idx];

  try {
    // Scroll el handle a la vista para asegurar que es clickable
    try {
      await handle.evaluate((el: any) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await new Promise((r) => setTimeout(r, 200));
    } catch { /* ignore */ }

    // Estrategia 1: doble-click + retry (MrPlan TCloudV2 abre con double-click)
    // Hasta 2 reintentos si el primer click no produce el modal
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await handle.click({ clickCount: 2, delay: 50 });
        await new Promise((r) => setTimeout(r, 600));
      } catch { /* try next */ }

      // Comprobación rápida: ¿hay modal visible ya?
      const modalVisible = await frame.evaluate(() => {
        const sels = ['.modal.show', '.modal.in', '.modal[style*="display: block"]', '[role="dialog"][aria-modal="true"]'];
        return sels.some(s => {
          const el = document.querySelector(s) as HTMLElement | null;
          return el && (el.offsetParent !== null);
        });
      }).catch(() => false);
      if (modalVisible) break;

      // Si no hay modal aún, esperar 400ms más antes de reintento
      if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
    }

    // Esperar modal de Bootstrap/MrPlan
    const modalSelectors = [
      '.modal.show',
      '.modal.in',
      '.modal[style*="display: block"]',
      '#modal_reserva',
      '#modalReserva',
      '#modal-reserva',
      '.modal-reserva',
      '[role="dialog"][aria-modal="true"]',
      '.swal2-popup',
      '.ui-dialog',
    ];
    for (const sel of modalSelectors) {
      const found = await frame.waitForSelector(sel, { visible: true, timeout: 1500 }).catch(() => null);
      if (found) {
        if (debug) {
          log.info(`Modal opened via dblclick · selector="${sel}" · idx=${idx}`);
          // Dump modal HTML para las primeras 3 reservas
          if (idx < 3) {
            try {
              const html = await frame.evaluate((s: string) => {
                const m = document.querySelector(s);
                return m ? m.outerHTML : '';
              }, sel);
              if (html) {
                const page = (frame as any).page ? (frame as any).page() : null;
                if (page) {
                  const png = await page.screenshot({ fullPage: true, type: 'png' });
                  const { KeyValueStore } = await import('crawlee');
                  const store = await KeyValueStore.open('debug-screenshots');
                  await store.setValue(`modal-dblclick-idx-${idx}.html`, html, { contentType: 'text/html' });
                  await store.setValue(`modal-dblclick-idx-${idx}.png`, png, { contentType: 'image/png' });
                  log.info(`Modal HTML dumped: modal-dblclick-idx-${idx}.html (${html.length} chars)`);
                }
              }
            } catch (e: any) { log.warning(`dump fail: ${e.message}`); }
          }
        }
        return true;
      }
    }

    // Estrategia 2: click + buscar botón "Abrir Reserva" / "Editar Reserva"
    await handles[idx].click({ delay: 50 });
    await new Promise((r) => setTimeout(r, 400));

    const openClicked = await frame.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('a, button, li, div, span'));
      for (const el of candidates) {
        const txt = (el.textContent || '').trim();
        if (/^(Abrir Reserva|Ver detalle|Editar Reserva|Ver Reserva|Detalle Reserva)$/i.test(txt)) {
          (el as HTMLElement).click();
          return { found: true, text: txt };
        }
      }
      return { found: false };
    }).catch(() => ({ found: false }));
    if (debug && (openClicked as any).found) log.info(`Clicked open button: ${(openClicked as any).text}`);

    for (const sel of modalSelectors) {
      const found = await frame.waitForSelector(sel, { visible: true, timeout: 1500 }).catch(() => null);
      if (found) {
        if (debug) {
          log.info(`Modal opened via open-button · selector="${sel}" · idx=${idx}`);
          if (idx < 3) {
            try {
              const html = await frame.evaluate((s: string) => {
                const m = document.querySelector(s);
                return m ? m.outerHTML : '';
              }, sel);
              if (html) {
                const page = (frame as any).page ? (frame as any).page() : null;
                if (page) {
                  const png = await page.screenshot({ fullPage: true, type: 'png' });
                  const { KeyValueStore } = await import('crawlee');
                  const store = await KeyValueStore.open('debug-screenshots');
                  await store.setValue(`modal-openbtn-idx-${idx}.html`, html, { contentType: 'text/html' });
                  await store.setValue(`modal-openbtn-idx-${idx}.png`, png, { contentType: 'image/png' });
                  log.info(`Modal HTML dumped: modal-openbtn-idx-${idx}.html (${html.length} chars)`);
                }
              }
            } catch (e: any) { log.warning(`dump fail: ${e.message}`); }
          }
        }
        return true;
      }
    }

    // Estrategia 3: en el documento (no solo frame) por si MrPlan abre modal a nivel top
    try {
      const page = (frame as any).page ? (frame as any).page() : null;
      if (page) {
        for (const sel of modalSelectors) {
          const found = await page.waitForSelector(sel, { visible: true, timeout: 1000 }).catch(() => null);
          if (found) {
            if (debug) log.info(`Modal opened at page-level · selector="${sel}" · idx=${idx}`);
            return true;
          }
        }
      }
    } catch { /* ignore */ }

    if (debug) {
      log.warning(`Modal didn't appear for reserva idx ${idx}`);
      // Guardar screenshot del estado actual para debug
      try {
        const page = (frame as any).page ? (frame as any).page() : null;
        if (page && idx < 3) {
          const { KeyValueStore } = await import('crawlee');
          const store = await KeyValueStore.open('debug-screenshots');
          const png = await page.screenshot({ fullPage: true, type: 'png' });
          await store.setValue(`reserva-idx-${idx}-no-modal.png`, png, { contentType: 'image/png' });
        }
      } catch { /* ignore */ }
    }
    return false;
  } catch (err) {
    log.warning(`openReservaModal idx ${idx} failed: ${(err as Error).message}`);
    return false;
  }
}

async function closeModal(frame: Frame): Promise<void> {
  // 1) Intentar click sobre cualquier botón cerrar visible (CSS válidos en Puppeteer)
  const closers = [
    '.modal.show .btn-close',
    '.modal.show button.close',
    '.modal.show [data-dismiss="modal"]',
    '.modal.show [data-bs-dismiss="modal"]',
    '.modal.show [aria-label="Close"]',
    '.modal.in .btn-close',
    '.modal.in button.close',
  ];
  let clicked = false;
  for (const sel of closers) {
    try {
      const el = await frame.$(sel);
      if (el) {
        await el.click({ delay: 30 });
        clicked = true;
        break;
      }
    } catch { /* try next */ }
  }
  // 2) Si no clickeó, buscar botón por texto via evaluate
  if (!clicked) {
    try {
      clicked = await frame.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.modal.show button, .modal.in button, .modal[style*="display: block"] button')) as HTMLElement[];
        const cerrar = btns.find((b) => /cerrar|close/i.test(b.textContent || '') || b.classList.contains('close') || b.getAttribute('aria-label') === 'Close');
        if (cerrar) {
          cerrar.click();
          return true;
        }
        return false;
      });
    } catch { /* ignore */ }
  }
  // 3) Fallback: ESC en window + ocultar modal manualmente
  if (!clicked) {
    await frame.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', which: 27, keyCode: 27, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', which: 27, keyCode: 27, bubbles: true }));
      // Hard close: quitar clase show + backdrop
      document.querySelectorAll('.modal.show, .modal.in').forEach((m) => {
        (m as HTMLElement).classList.remove('show', 'in');
        (m as HTMLElement).style.display = 'none';
      });
      document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
      document.body.classList.remove('modal-open');
      (document.body as HTMLElement).style.overflow = '';
    });
  }
  // 4) Esperar a que .modal.show desaparezca (máx 1s)
  try {
    await frame.waitForFunction(() => {
      return !document.querySelector('.modal.show, .modal.in, .modal[style*="display: block"]');
    }, { timeout: 1000 });
  } catch { /* modal still open — try one more hard close */
    await frame.evaluate(() => {
      document.querySelectorAll('.modal').forEach((m) => {
        (m as HTMLElement).classList.remove('show', 'in');
        (m as HTMLElement).style.display = 'none';
      });
      document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
    });
  }
}

export async function scrapePlanning(
  page: Page,
  options: ScrapeOptions
): Promise<ScrapeResult> {
  const errors: ScrapingError[] = [];
  const reservas: ReservaScraped[] = [];
  let monthsScraped = 0;

  // Llegar al planning
  const initialFrame = await getMainFrame(page);
  let frame = await gotoPlanning(page, initialFrame);

  // Rewind a monthsBack si se pidió
  for (let b = 0; b < options.monthsBack; b++) {
    const ok = await clickPrevMonth(frame);
    if (!ok) {
      log.warning(`Could not click prev month at iteration ${b}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 800));
    frame = await getMainFrame(page);
  }

  const totalMonths = options.monthsBack + options.monthsAhead;

  for (let m = 0; m < totalMonths; m++) {
    log.info(`-- Scraping month ${m + 1}/${totalMonths} --`);
    // Esperar a que el planning re-renderice
    await new Promise((r) => setTimeout(r, 1500));
    frame = await getMainFrame(page);

    if (options.debug && options.saveScreenshot) {
      const buf = await page.screenshot({ fullPage: false });
      await options.saveScreenshot(`month-${m}-overview.png`, buf as Buffer);
    }

    const handles = await getReservaHandles(frame);
    log.info(`Month ${m + 1}: found ${handles.length} reserva elements`);

    for (let i = 0; i < handles.length; i++) {
      try {
        const opened = await openReservaModal(frame, i, options.debug);
        if (!opened) {
          errors.push({ step: 'openModal', error: 'modal not visible', reservaIndex: i });
          continue;
        }

        const parsed = await parseModalReserva(frame);
        if (parsed) {
          reservas.push(parsed);
        } else {
          errors.push({ step: 'parseModal', error: 'parse returned null', reservaIndex: i });
        }
      } catch (err) {
        errors.push({
          step: 'iterateReserva',
          error: (err as Error).message,
          reservaIndex: i,
        });
      } finally {
        await closeModal(frame);
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    monthsScraped++;

    // Avanzar al siguiente mes (excepto en el último)
    if (m < totalMonths - 1) {
      const ok = await clickNextMonth(frame);
      if (!ok) {
        errors.push({ step: 'clickNextMonth', error: 'navigation button not found', reservaIndex: m });
        break;
      }
    }
  }

  // Deduplicar por id_reserva (alguna reserva puede aparecer en 2 meses si cruza)
  const dedup = new Map<string, ReservaScraped>();
  for (const r of reservas) {
    dedup.set(r.id_reserva, r);
  }

  return {
    reservas: Array.from(dedup.values()),
    errors,
    monthsScraped,
  };
}


