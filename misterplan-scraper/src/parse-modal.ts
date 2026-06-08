/**
 * Parser del modal de detalle de reserva en MisterPlan.
 *
 * Estructura observada (recon D-132):
 *   - Header con "Reserva 1-7328706"
 *   - Tabla con filas: "Reserva desde", "Llegada", "Salida", "Noches",
 *                      "Habitación", "Huésped", "Email", "Teléfono",
 *                      "Importe", "Anticipo", "Pendiente", "Forma de pago",
 *                      "Factura", "Observaciones", "Fecha reserva"
 *
 * El parser usa una estrategia de pares clave-valor por proximidad textual:
 * busca elementos con texto "Llegada" y extrae el contenido del siguiente
 * `<td>` o sibling. Si MisterPlan cambia la maquetación, el parser sigue
 * funcionando si las claves siguen presentes.
 *
 * Esta estrategia hace el scraper resistente a tweaks visuales.
 */

import type { Frame } from 'puppeteer';
import { log } from 'crawlee';
import type { ReservaScraped, Habitacion } from './types.js';
import {
  parseEuros,
  parseDateESP,
  parseDateTimeESP,
  diffNoches,
  mapCanal,
  normalizeHabitacion,
  calcEstadoCobro,
  inferEstadoReserva,
  splitNombre,
  normalizePais,
  parseIdReserva,
  detectMoneda,
} from './utils.js';

/** Extrae value asociado a una key dentro del modal. */
async function extractByLabel(frame: Frame, labels: string[]): Promise<string | null> {
  for (const label of labels) {
    const value = await frame.evaluate((labelText) => {
      // Buscar el elemento que contenga exactamente o startsWith ese label
      const all = Array.from(document.querySelectorAll('td, th, label, .field-label, dt, span, div'));
      const labelEl = all.find((el) => {
        const t = (el.textContent ?? '').trim();
        return t === labelText || t === labelText + ':' || t.startsWith(labelText);
      });
      if (!labelEl) return null;

      // Heurística 1: el siguiente sibling con texto
      let sibling = labelEl.nextElementSibling;
      while (sibling) {
        const txt = (sibling.textContent ?? '').trim();
        if (txt && txt !== labelText) return txt;
        sibling = sibling.nextElementSibling;
      }

      // Heurística 2: si el labelEl es un <td>, mirar el siguiente <td> de la fila
      if (labelEl.tagName === 'TD') {
        const tr = labelEl.parentElement;
        if (tr) {
          const tds = Array.from(tr.querySelectorAll('td'));
          const idx = tds.indexOf(labelEl as HTMLTableCellElement);
          if (idx >= 0 && idx + 1 < tds.length) {
            const next = (tds[idx + 1].textContent ?? '').trim();
            if (next) return next;
          }
        }
      }

      // Heurística 3: si el label es un <dt>, el siguiente <dd>
      if (labelEl.tagName === 'DT') {
        const dd = labelEl.nextElementSibling;
        if (dd?.tagName === 'DD') return (dd.textContent ?? '').trim() || null;
      }

      return null;
    }, label);
    if (value && value !== '') return value;
  }
  return null;
}

/** Lee TODO el texto del modal — útil para regex como fallback y para id_reserva del header */
async function getModalText(frame: Frame): Promise<string> {
  return await frame.evaluate(() => {
    const selectors = ['.modal-reserva', '.modal.show', '#reserva-modal', '[role="dialog"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return (el as HTMLElement).innerText;
    }
    return '';
  });
}

/** Construye el objeto ReservaScraped a partir del DOM del modal. */
export async function parseModalReserva(frame: Frame): Promise<ReservaScraped | null> {
  const modalText = await getModalText(frame);
  if (!modalText) return null;

  // Identificador único de la reserva (clave del upsert)
  const idReserva = parseIdReserva(modalText);
  if (!idReserva) {
    log.warning('Modal sin ID reserva detectable — saltando');
    return null;
  }

  // Extraer campos individuales por label
  const llegadaStr = (await extractByLabel(frame, ['Llegada', 'Entrada', 'Check-in'])) ?? '';
  const salidaStr = (await extractByLabel(frame, ['Salida', 'Check-out'])) ?? '';
  const habitacionStr = (await extractByLabel(frame, ['Habitación', 'Habitacion', 'Tipo habitación'])) ?? '';
  const huespedStr = (await extractByLabel(frame, ['Huésped', 'Huesped', 'Cliente', 'Titular'])) ?? '';
  const emailStr = (await extractByLabel(frame, ['Email', 'E-mail', 'Correo'])) ?? '';
  const telefonoStr = (await extractByLabel(frame, ['Teléfono', 'Telefono', 'Móvil'])) ?? '';
  const paisStr = (await extractByLabel(frame, ['País', 'Pais', 'Nacionalidad'])) ?? '';
  const docStr = (await extractByLabel(frame, ['Documento', 'DNI', 'NIE', 'Pasaporte'])) ?? '';
  const importeStr = (await extractByLabel(frame, ['Importe total', 'Importe', 'Total'])) ?? '';
  const anticipoStr = (await extractByLabel(frame, ['Anticipo', 'Pagado'])) ?? '';
  const pendienteStr = (await extractByLabel(frame, ['Pendiente', 'Pendiente cobro'])) ?? '';
  const canalStr = (await extractByLabel(frame, ['Reserva desde', 'Canal', 'Origen'])) ?? '';
  const formaPagoStr = (await extractByLabel(frame, ['Forma de pago', 'Método pago', 'Pago'])) ?? '';
  const facturaStr = (await extractByLabel(frame, ['Factura', 'Nº factura', 'Factura nº'])) ?? '';
  const fechaReservaStr = (await extractByLabel(frame, ['Fecha reserva', 'Fecha alta', 'Realizada'])) ?? '';
  const observacionesStr = (await extractByLabel(frame, ['Observaciones', 'Notas', 'Comentarios'])) ?? '';
  const localizadorStr = (await extractByLabel(frame, ['Localizador', 'Reserva externa', 'Booking ID'])) ?? '';
  const numHuespedesStr = (await extractByLabel(frame, ['Huéspedes', 'Personas', 'Adultos'])) ?? '';

  // Estado: cancelada / no_show son flags que pueden aparecer como badge o etiqueta
  const cancelada = /cancelada|cancelled/i.test(modalText);
  const noShow = /no.show|no presentado/i.test(modalText);

  // Parseos
  const fecha_in = parseDateESP(llegadaStr);
  const fecha_out = parseDateESP(salidaStr);
  const noches = diffNoches(fecha_in, fecha_out);
  const importe_total = parseEuros(importeStr);
  const anticipo = parseEuros(anticipoStr);
  const pendiente_cobro = parseEuros(pendienteStr) || Math.max(0, importe_total - anticipo);
  const importe_moneda = detectMoneda(importeStr);
  const { nombre, apellidos } = splitNombre(huespedStr);
  const num_huespedes = parseInt(numHuespedesStr.match(/\d+/)?.[0] ?? '', 10);

  const reserva: ReservaScraped = {
    id_reserva: idReserva,
    localizador_externo: localizadorStr || null,
    canal: mapCanal(canalStr),
    habitacion: normalizeHabitacion(habitacionStr) as Habitacion | string,
    fecha_in,
    fecha_out,
    noches,
    huesped_nombre: nombre,
    huesped_apellidos: apellidos,
    huesped_email: emailStr.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null,
    huesped_telefono: telefonoStr.replace(/\s+/g, '').match(/^[+\d][\d]{6,}/)?.[0] ?? null,
    huesped_pais: normalizePais(paisStr),
    huesped_documento: docStr || null,
    importe_total,
    importe_moneda,
    anticipo,
    pendiente_cobro,
    estado_reserva: inferEstadoReserva(fecha_in, fecha_out, cancelada, noShow),
    estado_cobro: calcEstadoCobro(importe_total, anticipo, pendiente_cobro),
    forma_pago: formaPagoStr || null,
    factura_num: facturaStr.match(/\d+/)?.[0] ?? null,
    fecha_reserva: parseDateTimeESP(fechaReservaStr),
    observaciones: observacionesStr || null,
    num_huespedes: Number.isFinite(num_huespedes) && num_huespedes > 0 ? num_huespedes : null,
    _raw: {
      modalText: modalText.slice(0, 2000), // primeros 2KB para debug
    },
  };

  // Validaciones mínimas
  if (!reserva.fecha_in || !reserva.fecha_out) {
    log.warning(`Reserva ${idReserva}: fechas vacías (in=${reserva.fecha_in}, out=${reserva.fecha_out})`);
  }

  return reserva;
}
