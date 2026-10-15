/**
 * Scraping del Planning de MisterPlan.
 *
 * Estructura (verificada en vivo sobre el planning real, 15/10/2026):
 *   - El planning vive en el DOCUMENTO PRINCIPAL, no en un iframe
 *   - `div.reserva[id_reserva]`, uno por reserva y por día, más clones
 *     `_bloqueo_fantasma_N` en las filas de las demás habitaciones
 *   - Un clic selecciona la reserva y despliega la barra `#abrir_reserva`
 *   - La ficha se pinta en `#modalCentral`, contenedor único y reutilizado
 *
 * Estrategia:
 *   1. Situar el planning en el mes objetivo (goToMonth, navegación absoluta)
 *   2. Listar las reservas ÚNICAS del mes (getReservaRefs)
 *   3. Por cada una: clic → "Abrir Reserva" → esperar `#modalCentral.show`
 *      → comprobar que el id de la ficha es el pedido → parseModal
 *   4. Cerrar la ficha SIN borrarla del DOM, siguiente reserva
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

/**
 * Referencia a UNA reserva del planning.
 *
 * MisterPlan pinta un `div.reserva` por reserva Y POR DÍA, y además genera
 * clones con el sufijo `_bloqueo_fantasma_N` en las filas de las demás
 * habitaciones. En una vista de octubre 2026 eso son 96 elementos para solo
 * 14 reservas reales: abríamos la misma ficha siete veces.
 */
type ReservaRef = { domId: string; idReserva: string };

/**
 * Una entrada por reserva real: sin clones fantasma, sin repetir días.
 * La ficha trae todas las habitaciones de la reserva, así que abrirla una vez
 * basta (parse-modal ya emite una fila por habitación).
 */
async function getReservaRefs(frame: Frame): Promise<ReservaRef[]> {
  const refs: ReservaRef[] = await frame
    .evaluate(() => {
      const out: Array<{ domId: string; idReserva: string }> = [];
      const vistos = new Set<string>();
      const els = Array.from(document.querySelectorAll('div.reserva')) as HTMLElement[];
      for (const el of els) {
        if (/bloqueo_fantasma/i.test(el.id)) continue;          // clon de MisterPlan
        // Los cierres y bloqueos de disponibilidad también son `.reserva`,
        // pero NO tienen ficha: al seleccionarlos la barra inferior ofrece
        // "Borrar Bloqueos", no "Abrir Reserva". Las reservas reales llevan
        // `.final`; los bloqueos, `.bloqueo`.
        if (!el.classList.contains('final') || el.classList.contains('bloqueo')) continue;
        if (el.closest('.modal, .modal-dialog, [role="dialog"]')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const idReserva = el.getAttribute('id_reserva') || '';
        const clave = idReserva || el.id;
        if (!clave || vistos.has(clave)) continue;              // mismo id en varios días
        vistos.add(clave);
        if (el.id) out.push({ domId: el.id, idReserva });
      }
      return out;
    })
    .catch(() => [] as ReservaRef[]);
  log.info(`Reservas únicas en el planning: ${refs.length}`);
  return refs;
}

/**
 * Botón "Abrir Reserva" de la barra inferior.
 *
 * Verificado en vivo el 15/10/2026 sobre el planning real: un ÚNICO clic sobre
 * la reserva la selecciona y despliega `#abrir_reserva`. El doble clic que
 * hacíamos antes seleccionaba y volvía a deseleccionar, así que la barra nunca
 * llegaba a quedar en pantalla y el log repetía
 * `No se encontró un botón "Abrir Reserva" visible`.
 */
const ABRIR_SELECTOR =
  '#abrir_reserva li.abrirReservaEvnt, #abrir_reserva a.linkBarraHerramientas';

/**
 * La ficha se abre SIEMPRE en `#modalCentral`, en el documento principal.
 *
 * Dos trampas comprobadas en el DOM real:
 *
 *  1. `#modalCentral` es `position: fixed`, y para un elemento fijo
 *     `offsetParent` vale `null` SIEMPRE, abierto o cerrado. Todas nuestras
 *     comprobaciones de visibilidad usaban `offsetParent !== null`, así que el
 *     modal se daba por no abierto incluso estándolo. Aquí se mira la clase
 *     `show`, el `display` calculado y el alto real del contenido.
 *  2. `#modalCentral` es un contenedor ÚNICO que MisterPlan reutiliza para
 *     cada ficha. No se puede borrar del DOM (ver closeModal).
 */
async function modalAbierto(frame: Frame, timeoutMs: number): Promise<boolean> {
  const ok = await frame
    .waitForFunction(
      () => {
        const m = document.getElementById('modalCentral');
        if (!m) return false;
        if (!m.classList.contains('show')) return false;
        if (getComputedStyle(m).display === 'none') return false;
        const c = m.querySelector('.modal-content') as HTMLElement | null;
        return !!c && c.getBoundingClientRect().height > 100;
      },
      { timeout: timeoutMs },
    )
    .catch(() => null);
  return !!ok;
}

/**
 * Clic en la reserva → clic en "Abrir Reserva" → esperar `#modalCentral`.
 * Devuelve el frame donde está la ficha, o null si no abrió.
 */
async function openReservaModal(
  frame: Frame,
  ref: ReservaRef,
  debug = false,
): Promise<Frame | null> {
  try {
    const handle = await frame.$(`div.reserva[id="${ref.domId}"]`);
    if (!handle) {
      if (debug) log.warning(`Reserva ${ref.idReserva}: el elemento ${ref.domId} ya no está en el DOM`);
      return null;
    }

    try {
      await handle.evaluate((el: any) => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
      await new Promise((r) => setTimeout(r, 150));
    } catch { /* ignore */ }

    // 1) UN solo clic: selecciona la reserva y despliega la barra inferior.
    //    Hay que CONFIRMAR que la selección ha cambiado. La barra
    //    `#abrir_reserva` no se vacía entre fichas: conserva el tamaño de la
    //    selección anterior, así que `waitForSelector(visible)` daba positivo
    //    aunque el clic no hubiera entrado, y acto seguido pulsábamos un botón
    //    que ya no apuntaba a nada. La reserva seleccionada lleva la clase
    //    `seleccionada_principal`.
    let seleccionada = false;
    for (let intento = 0; intento < 3 && !seleccionada; intento++) {
      try {
        if (intento === 0) {
          await handle.click({ delay: 40 });
        } else {
          // Reintento: clic sintético. El planning engancha la selección con
          // un handler delegado de jQuery, que sí responde a `el.click()`,
          // y así no dependemos de que el ratón acierte en una barra de
          // pocos píxeles o medio salida del scroll horizontal.
          await handle.evaluate((el: any) => el.click());
        }
      } catch { /* reintento */ }
      seleccionada = !!(await frame
        .waitForFunction(
          (id: string) => {
            const sel = document.querySelector('.reserva.seleccionada_principal');
            return !!sel && sel.getAttribute('id_reserva') === id;
          },
          { timeout: 2000 },
          ref.idReserva,
        )
        .catch(() => null));
    }
    if (!seleccionada) {
      if (debug) log.warning(`Reserva ${ref.idReserva}: el clic no llegó a seleccionarla`);
      return null;
    }

    // 2) Botón "Abrir Reserva".
    const btn = await frame
      .waitForSelector(ABRIR_SELECTOR, { visible: true, timeout: 4000 })
      .catch(() => null);
    if (!btn) {
      if (debug) log.warning(`Reserva ${ref.idReserva}: la barra "Abrir Reserva" no apareció tras seleccionarla`);
      return null;
    }
    await btn.click({ delay: 60 });

    // 3) Esperar la ficha.
    if (!(await modalAbierto(frame, 8000))) {
      if (debug) log.warning(`Reserva ${ref.idReserva}: #modalCentral no llegó a abrirse`);
      return null;
    }

    // 4) Comprobar que la ficha abierta es la que pedimos. Si la barra
    //    conservaba la selección anterior parsearíamos la reserva equivocada
    //    sin enterarnos — exactamente el tipo de fallo silencioso que nos ha
    //    costado los descuadres de este proyecto.
    const idEnModal = await frame
      .evaluate(() => {
        const b = document.querySelector('#modalCentral [id_reserva]');
        return b ? b.getAttribute('id_reserva') : null;
      })
      .catch(() => null);
    if (idEnModal && ref.idReserva && idEnModal !== ref.idReserva) {
      log.warning(`FICHA_CRUZADA: pedida ${ref.idReserva}, abierta ${idEnModal} — se descarta`);
      return null;
    }

    if (debug) log.info(`Ficha abierta · reserva ${ref.idReserva}`);
    return frame;
  } catch (err) {
    log.warning(`openReservaModal ${ref.idReserva} falló: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Cierra la ficha.
 *
 * NADA DE CIRUGÍA SOBRE EL DOM. Dos versiones seguidas han muerto aquí:
 *   · la primera borraba los nodos `.modal`, y con ellos `#modalCentral`, que
 *     es el contenedor único que MisterPlan reutiliza para todas las fichas;
 *   · la segunda ya no borraba nada, pero forzaba `display:none`, quitaba la
 *     clase `show` y eliminaba el backdrop a mano. Eso desincroniza el estado
 *     interno de Bootstrap: cree que el modal sigue abierto y la siguiente
 *     llamada a `show` no hace nada. Síntoma: abre la PRIMERA ficha de cada
 *     mes y ninguna más.
 *
 * Comprobado en vivo sobre el planning real (15/10/2026): pulsando el botón
 * de cierre, Bootstrap deja solo el `#modalCentral` oculto, cero backdrops y
 * el body limpio, y la ficha siguiente abre sin problema.
 */
async function closeModal(frame: Frame): Promise<void> {
  // El aspa de cierre es un botón pequeño del header, arrastrable y a veces
  // tapado. El clic con ratón fallaba en todas las fichas y nos costaba ocho
  // segundos de espera cada una. Bootstrap resuelve el cierre con un handler
  // delegado, así que un `el.click()` sirve igual.
  await frame
    .evaluate(() => {
      const b = document.querySelector(
        '#modalCentral button[data-dismiss="modal"], #modalCentral button[data-bs-dismiss="modal"]',
      ) as HTMLElement | null;
      if (b) b.click();
    })
    .catch(() => null);

  const cerrado = await frame
    .waitForFunction(
      () => {
        const m = document.getElementById('modalCentral');
        if (!m) return true;
        return !m.classList.contains('show') && getComputedStyle(m).display === 'none';
      },
      { timeout: 3000 },
    )
    .catch(() => null);
  if (cerrado) return;

  // Fallback: pedírselo a Bootstrap, que se encarga de backdrop y body.
  await frame
    .evaluate(() => {
      const w = window as any;
      try {
        if (w.jQuery) w.jQuery('#modalCentral').modal('hide');
      } catch { /* ignore */ }
    })
    .catch(() => null);
  await frame
    .waitForFunction(
      () => {
        const m = document.getElementById('modalCentral');
        return !m || getComputedStyle(m).display === 'none';
      },
      { timeout: 3000 },
    )
    .catch(() => null);
  log.warning('closeModal: la ficha no se cerró por el botón; forzado por jQuery');
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
  /** Fichas seguidas sin abrir antes de dar el planning por roto. */
  const MAX_FALLOS_MODAL = 5;
  let modalRoto = false;
  let cortadoPorTiempo = false;
  const tiempoAgotado = () =>
    timeoutAt !== null && Date.now() > timeoutAt - RESERVA_MARGEN_MS;

  for (let m = 0; m < totalMonths; m++) {
    if (tiempoAgotado()) {
      cortadoPorTiempo = true;
      log.warning(`Presupuesto de tiempo agotado antes del mes ${m + 1}/${totalMonths} — cierre limpio con ${monthsScraped} meses persistidos`);
      break;
    }
    let fallosModalSeguidos = 0;
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

    const refs = await getReservaRefs(frame);
    log.info(`Month ${m + 1}: ${refs.length} reservas únicas`);

    for (let i = 0; i < refs.length; i++) {
      if (tiempoAgotado()) {
        cortadoPorTiempo = true;
        log.warning(`Presupuesto de tiempo agotado en el mes ${m + 1} tras ${i}/${refs.length} reservas`);
        break;
      }
      let modalFrame: Frame | null = null;
      try {
        modalFrame = await openReservaModal(frame, refs[i], options.debug);
        if (!modalFrame) {
          errors.push({ step: 'openModal', error: 'modal not visible', reservaIndex: i });
          fallosModalSeguidos++;
          // Si ninguna ficha abre, MisterPlan ha cambiado el planning. Seguir
          // intentando las 60 restantes solo quema tiempo y créditos: en una
          // ejecución real esto costó 44 minutos por mes sin extraer nada.
          if (fallosModalSeguidos >= MAX_FALLOS_MODAL) {
            modalRoto = true;
            log.error(
              `MODAL_NO_ABRE: ${fallosModalSeguidos} fichas seguidas sin abrir en ${etiquetaMes}. ` +
              'Se aborta: lo más probable es que haya cambiado el DOM del planning de MisterPlan.',
            );
            errors.push({ step: 'openModal', error: `MODAL_NO_ABRE tras ${fallosModalSeguidos} intentos`, reservaIndex: i });
            break;
          }
          continue;
        }

        fallosModalSeguidos = 0;
        const parsed = await parseModalReserva(modalFrame, {
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
        await closeModal(modalFrame ?? frame);
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

    if (modalRoto) {
      log.error('Abortando el resto de meses: el planning no abre fichas.');
      break;
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










