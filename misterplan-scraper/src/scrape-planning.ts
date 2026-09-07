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
  /** Loguea las líneas con importe del modal cuando no se extrae ningún complementario */
  debugComplementarios?: boolean;
  /** Callback para guardar screenshots de debugging */
  saveScreenshot?: (name: string, buffer: Buffer) => Promise<void>;
  /** Callback tras cada mes procesado — persiste incremental antes de posible timeout */
  onMonthComplete?: (monthReservas: ReservaScraped[], monthIndex: number, totalMonths: number) => Promise<void>;
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
  return await navigateMonth(frame, +1);
}

/**
 * Navega ±N meses en el planning de MisterPlan.
 * MisterPlan expone un input de fecha (dd/mm/yyyy) en la cabecera del planning.
 * Cambiar su valor + trigger change() hace que el planning re-renderice al mes correspondiente.
 * Es más robusto que buscar botones chevron cuyo selector cambia entre versiones.
 */
async function navigateMonth(frame: Frame, direction: number): Promise<boolean> {
  try {
    const result = await frame.evaluate((dir: number) => {
      // Buscar TODOS los inputs con formato dd/mm/yyyy
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const dateInput = inputs.find(i =>
        i.offsetParent !== null &&
        /^\d{2}\/\d{2}\/\d{4}$/.test(i.value)
      );
      if (!dateInput) return { ok: false, reason: 'no visible date input found' };
      const parts = dateInput.value.split('/').map(Number);
      const [d, m, y] = parts;
      if (!d || !m || !y) return { ok: false, reason: 'invalid date value: ' + dateInput.value };
      const date = new Date(y, m - 1, d);
      date.setMonth(date.getMonth() + dir);
      const pad = (n: number) => String(n).padStart(2, '0');
      const newVal = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
      dateInput.value = newVal;
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      // jQuery event si está disponible
      const w: any = window;
      if (w.jQuery) {
        try { w.jQuery(dateInput).trigger('change'); w.jQuery(dateInput).change(); } catch {}
      }
      dateInput.blur();
      return { ok: true, oldVal: `${pad(d)}/${pad(m)}/${y}`, newVal };
    }, direction);
    if ((result as any)?.ok) {
      log.info(`Month navigation via date input: ${(result as any).oldVal} → ${(result as any).newVal}`);
      // Esperar a que el planning re-renderice
      await new Promise(r => setTimeout(r, 1500));
      return true;
    } else {
      log.warning(`Date input nav failed: ${(result as any)?.reason || 'unknown'}`);
    }
  } catch (e: any) {
    log.warning(`navigateMonth exception: ${e.message}`);
  }
  return false;
}

/**
 * Navega a un mes CONCRETO (año + mes) y VERIFICA que el planning lo muestra.
 *
 * Por qué absoluto y no ±1: navigateMonth leía el valor actual del input y le
 * sumaba un mes. Eso arrastra dos fallos que dejaban meses pasados sin releer:
 *  · desbordamiento de día (31 de marzo −1 mes = 3 de marzo), y
 *  · si MrPlan no reescribe el input tras el re-render, el siguiente salto
 *    parte de un valor viejo y se repite o se salta un mes.
 * Además antes se devolvía true por el mero hecho de escribir en el input,
 * sin comprobar que el planning hubiera cambiado de mes.
 */
async function goToMonth(frame: Frame, year: number, month1: number): Promise<boolean> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const objetivo = `${pad(month1)}/${year}`;

  for (let intento = 1; intento <= 3; intento++) {
    const res = await frame.evaluate((target: { y: number; m: number }) => {
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const dateInput = inputs.find(
        (i) => i.offsetParent !== null && /^\d{2}\/\d{2}\/\d{4}$/.test(i.value),
      );
      if (!dateInput) return { ok: false, reason: 'no visible date input' };
      const pad2 = (n: number) => String(n).padStart(2, '0');
      // Día 01 siempre: evita cualquier desbordamiento de mes.
      const nuevo = `01/${pad2(target.m)}/${target.y}`;
      const anterior = dateInput.value;
      dateInput.value = nuevo;
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      const w: any = window;
      if (w.jQuery) {
        try { w.jQuery(dateInput).trigger('change'); w.jQuery(dateInput).change(); } catch {}
      }
      dateInput.blur();
      return { ok: true, anterior, nuevo };
    }, { y: year, m: month1 });

    if (!(res as any)?.ok) {
      log.warning(`goToMonth ${objetivo}: ${(res as any)?.reason}`);
      return false;
    }

    // Dar tiempo al re-render, creciente en cada reintento
    await new Promise((r) => setTimeout(r, 1500 * intento));

    // VERIFICAR que el planning está realmente en el mes pedido
    const verif = await frame.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
      const di = inputs.find(
        (i) => i.offsetParent !== null && /^\d{2}\/\d{2}\/\d{4}$/.test(i.value),
      );
      return di ? di.value : null;
    });

    if (typeof verif === 'string') {
      const [, mm, yyyy] = verif.split('/');
      if (`${mm}/${yyyy}` === objetivo) {
        log.info(`Planning en ${objetivo} (intento ${intento})`);
        return true;
      }
      log.warning(`goToMonth ${objetivo}: el planning muestra ${mm}/${yyyy} (intento ${intento})`);
    }
  }
  return false;
}

async function clickPrevMonth(frame: Frame): Promise<boolean> {
  // Estrategia 1: cambiar el input de fecha (más fiable en MisterPlan TCloudV2)
  const navOk = await navigateMonth(frame, -1);
  if (navOk) return true;
  // Estrategia 2 (fallback): buscar botones chevron por selector CSS
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
  // Probamos varias variantes para robustez. Solo devolvemos elementos visibles
  // que NO estén dentro de un modal (evita capturar .reserva del modal fantasma).
  const selectorVariants = [
    '.reserva-bar',
    '.reserva',
    '[class*="reserva-"]',
    '[data-tipo="reserva"]',
  ];
  for (const sel of selectorVariants) {
    const allHandles = await frame.$$(sel);
    if (allHandles.length === 0) continue;
    // Filtrar: solo visibles Y no dentro de .modal
    const filtered = [];
    for (const h of allHandles) {
      const ok = await h.evaluate((el: any) => {
        // No debe estar dentro de un modal (residual ni activo)
        if (el.closest('.modal, .modal-dialog, .modal-content, [role="dialog"]')) return false;
        // Debe ser visible
        if (!el.offsetParent) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        return true;
      }).catch(() => false);
      if (ok) filtered.push(h);
    }
    if (filtered.length > 0) {
      log.info(`Found ${filtered.length} reservas via selector "${sel}" (filtered from ${allHandles.length})`);
      return filtered;
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
  // 4) Esperar a que .modal.show desaparezca (máx 3s — modales grandes tardan más)
  try {
    await frame.waitForFunction(() => {
      const visibles = Array.from(document.querySelectorAll('.modal.show, .modal.in, .modal[style*="display: block"], [role="dialog"][aria-modal="true"]'));
      return visibles.every((m: any) => !m.offsetParent);
    }, { timeout: 3000 });
  } catch { /* seguirá con el nuked-cleanup abajo */ }

  // 5) NUKE FINAL: eliminar TODO rastro de modal del DOM (evita fantasmas
  //    que contengan .reserva y confundan al siguiente getReservaHandles)
  await frame.evaluate(() => {
    // Eliminar completamente cualquier .modal / .modal-dialog / [role="dialog"]
    document.querySelectorAll('.modal, .modal-dialog, .modal-backdrop, [role="dialog"][aria-modal="true"]').forEach((m) => {
      try { m.remove(); } catch { /* ignore */ }
    });
    // Restaurar body
    document.body.classList.remove('modal-open');
    (document.body as HTMLElement).style.overflow = '';
    (document.body as HTMLElement).style.paddingRight = '';
  }).catch(() => null);
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

  // Lista ABSOLUTA de meses a recorrer, calculada desde hoy una sola vez.
  // Antes se retrocedía con N clicks relativos y luego se avanzaba: si un solo
  // salto fallaba en silencio, el resto del recorrido quedaba desplazado y los
  // meses pasados no se releían nunca.
  const hoy = new Date();
  const objetivos: Array<{ year: number; month1: number }> = [];
  for (let off = -options.monthsBack; off < options.monthsAhead; off++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + off, 1);
    objetivos.push({ year: d.getFullYear(), month1: d.getMonth() + 1 });
  }
  const totalMonths = objetivos.length;
  log.info(
    `Meses objetivo (${totalMonths}): ${objetivos.map((o) => `${String(o.month1).padStart(2, '0')}/${o.year}`).join(', ')}`,
  );

  // PRESUPUESTO DE TIEMPO — el sync horario tenía timeout de 300s y TODAS las
  // ejecuciones morían como TIMED-OUT. Ahora paramos limpiamente antes del
  // límite: lo ya escrapeado queda persistido y el run acaba en SUCCEEDED.
  const timeoutAtRaw = process.env.ACTOR_TIMEOUT_AT;
  const timeoutAt = timeoutAtRaw ? new Date(timeoutAtRaw).getTime() : null;
  // 75s: con 45s todavía se colaba algún TIMED-OUT cuando el último modal tardaba
  const RESERVA_MARGEN_MS = 75_000;
  let cortadoPorTiempo = false;
  const tiempoAgotado = () =>
    timeoutAt !== null && Date.now() > timeoutAt - RESERVA_MARGEN_MS;

  for (let m = 0; m < totalMonths; m++) {
    if (tiempoAgotado()) {
      cortadoPorTiempo = true;
      log.warning(`Presupuesto de tiempo agotado antes del mes ${m + 1}/${totalMonths} — cierre limpio con ${monthsScraped} meses persistidos`);
      break;
    }
    const objetivo = objetivos[m];
    const etiquetaMes = `${String(objetivo.month1).padStart(2, '0')}/${objetivo.year}`;
    log.info(`-- Scraping month ${m + 1}/${totalMonths} (${etiquetaMes}) --`);
    const reservasBeforeMonth = reservas.length;

    frame = await getMainFrame(page);
    const enMes = await goToMonth(frame, objetivo.year, objetivo.month1);
    if (!enMes) {
      // Nunca escrapeamos "el mes que toque estar": o es el correcto o se salta.
      errors.push({ step: 'goToMonth', error: `no se pudo situar el planning en ${etiquetaMes}`, reservaIndex: m });
      log.warning(`Saltando ${etiquetaMes}: navegación no verificada`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 1000));
    frame = await getMainFrame(page);

    if (options.debug && options.saveScreenshot) {
      const buf = await page.screenshot({ fullPage: false });
      await options.saveScreenshot(`month-${m}-overview.png`, buf as Buffer);
    }

    const handles = await getReservaHandles(frame);
    log.info(`Month ${m + 1}: found ${handles.length} reserva elements`);

    for (let i = 0; i < handles.length; i++) {
      if (tiempoAgotado()) {
        cortadoPorTiempo = true;
        log.warning(`Presupuesto de tiempo agotado en el mes ${m + 1} tras ${i}/${handles.length} reservas`);
        break;
      }
      try {
        const opened = await openReservaModal(frame, i, options.debug);
        if (!opened) {
          errors.push({ step: 'openModal', error: 'modal not visible', reservaIndex: i });
          continue;
        }

        const parsed = await parseModalReserva(frame, {
          debugComplementarios: options.debugComplementarios === true,
        });
        if (parsed && parsed.length > 0) {
          reservas.push(...parsed);
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

    // Callback incremental: entregar las reservas de ESTE mes al main
    // para que las persista via webhook antes de un posible timeout.
    if (options.onMonthComplete) {
      const monthReservas = reservas.slice(reservasBeforeMonth);
      try {
        await options.onMonthComplete(monthReservas, m, totalMonths);
      } catch (e: any) {
        log.warning(`onMonthComplete callback threw: ${e.message}`);
      }
    }

    if (cortadoPorTiempo) break;
    // Ya no se avanza de forma relativa: la próxima iteración se sitúa sola
    // en su mes objetivo con goToMonth().
  }

  // Deduplicar por id_reserva + habitación (multi-room: una fila por habitación; cruces de mes)
  const dedup = new Map<string, ReservaScraped>();
  for (const r of reservas) {
    dedup.set(`${r.id_reserva}|${r.habitacion}`, r);
  }

  return {
    reservas: Array.from(dedup.values()),
    errors,
    monthsScraped,
  };
}










