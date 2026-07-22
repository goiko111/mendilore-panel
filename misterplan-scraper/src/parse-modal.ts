/**
 * Parser del modal de reserva MisterPlan TCloudV2.
 * (Reescrito v3 con dumps reales 9-jun-2026)
 */

import type { Frame } from 'puppeteer';
import { log } from 'crawlee';
import type { ReservaScraped, Canal, EstadoCobro, EstadoReserva, Habitacion } from './types.js';

const MODAL_SELECTORS = [
  '.modal.show',
  '.modal.in',
  '.modal[style*="display: block"]',
  '#modal_reserva',
  '#modalReserva',
  '#modal-reserva',
  '.modal-reserva',
  '[role="dialog"][aria-modal="true"]',
];

function parseFechaDDMMYYYY(s: string): string {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  const [, d, mm, y] = m;
  return `${y}-${mm.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseFechaISO(s: string): string {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
  if (!m) return parseFechaDDMMYYYY(s);
  const [, d, mo, y, h, mi, se] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${se.padStart(2, '0')}`;
}

function parseImporte(s: string): number {
  const cleaned = s.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizarCanal(s: string): Canal {
  const t = s.toLowerCase().trim();
  if (t.includes('booking')) return 'booking';
  if (t.includes('airbnb')) return 'airbnb';
  if (t.includes('expedia')) return 'expedia';
  if (t.includes('directo') || t.includes('teléfono') || t.includes('telefono')) return 'directo';
  if (t.includes('web') || t.includes('propia')) return 'web_propia';
  if (t.includes('walk') || t.includes('puerta')) return 'walk_in';
  return 'otro';
}

const HABITACIONES_VALIDAS: Habitacion[] = ['cala', 'nube', 'margarita', 'lino', 'limonero', 'lavanda'];

function normalizarHabitacion(s: string): Habitacion | string {
  const t = s.toLowerCase().replace(/^habitaci[oó]n\s+/i, '').trim();
  for (const h of HABITACIONES_VALIDAS) {
    if (t.includes(h)) return h;
  }
  return t;
}

function splitNombre(s: string): { nombre: string; apellidos: string | null } {
  const parts = s.trim().split(/\s+/);
  if (parts.length <= 1) return { nombre: s.trim(), apellidos: null };
  return { nombre: parts[0], apellidos: parts.slice(1).join(' ') };
}

export async function parseModalReserva(frame: Frame): Promise<ReservaScraped | null> {
  let modalText = '';
  let foundSelector = '';
  for (const sel of MODAL_SELECTORS) {
    try {
      const result = await frame.evaluate((s: string) => {
        // Si hay varios modales abiertos (poco probable pero defensivo), tomar el último
        const ms = document.querySelectorAll(s);
        if (ms.length === 0) return null;
        const m = ms[ms.length - 1];
        return (m as HTMLElement).innerText || '';
      }, sel);
      if (result) {
        modalText = result;
        foundSelector = sel;
        break;
      }
    } catch { /* try next */ }
  }
  if (!modalText) {
    log.warning('parseModalReserva: no modal found');
    return null;
  }

  // Solo logear el match para debug
  log.debug(`parseModalReserva: matched ${foundSelector} (${modalText.length} chars)`);

  // === Extracción por regex sobre innerText ===

  const idMatch = modalText.match(/Id reserva\s+([\w-]+)/i)
    || modalText.match(/Reserva\s+(\d+-\d+)/i);
  const id_reserva = idMatch?.[1]?.trim() ?? '';

  const localizadorMatch = modalText.match(/Localizador externo\s+(\S+)/i);
  const localizador_externo = localizadorMatch?.[1]?.trim() || null;

  const fechaResMatch = modalText.match(/Fecha Reserva\s+(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{1,2}:\d{1,2})?)/i);
  const fecha_reserva = fechaResMatch ? parseFechaISO(fechaResMatch[1]) : '';

  const fechasMatch = modalText.match(/Entrada\s*-\s*Salida\s+(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*\((\d+)\s*n/i);
  const fecha_in = fechasMatch ? parseFechaDDMMYYYY(fechasMatch[1]) : '';
  const fecha_out = fechasMatch ? parseFechaDDMMYYYY(fechasMatch[2]) : '';
  const noches = fechasMatch ? parseInt(fechasMatch[3], 10) : 0;

  const canalMatch = modalText.match(/Reserva desde\s+([^\n.]+?)(?:\s+Comisi|\n|$)/i);
  const canal: Canal = canalMatch ? normalizarCanal(canalMatch[1]) : 'otro';

  const habMatch = modalText.match(/Habitaci[oó]n\s+(\w+(?:\s+\w+)?)\s*\(/i)
    || modalText.match(/Habitaci[oó]n\s+(\w+)/i);
  const habitacion = habMatch ? normalizarHabitacion(habMatch[1]) : '';

  const nombreMatch = modalText.match(/Nombre\s+([^\n]+?)(?:\s*Espa[ñn]ol|\n)/i);
  const { nombre: huesped_nombre, apellidos: huesped_apellidos } = nombreMatch
    ? splitNombre(nombreMatch[1])
    : { nombre: '', apellidos: null };

  const emailMatch = modalText.match(/email\s+(\S+@\S+\.\w+)/i);
  const huesped_email = emailMatch?.[1]?.trim() || null;

  const telMatch = modalText.match(/Tel[eé]fono\s+([+\d\s-]{6,20})/i);
  const huesped_telefono = telMatch?.[1]?.trim().replace(/\s+/g, '') || null;

  const importeMatch = modalText.match(/Importe de la reserva\s+([\d.,]+)\s*€/i);
  const importe_total = importeMatch ? parseImporte(importeMatch[1]) : 0;

  // Desglose alojamiento / complementarios (migration 0016)
  // MisterPlan TCloudV2 usa estas etiquetas variables:
  //   "Habitación", "Alojamiento", "Hospedaje" → alojamiento
  //   "Complementos", "Extras", "Servicios" → complementarios
  let importe_alojamiento: number | null = null;
  let importe_complementarios = 0;
  const alojaMatch = modalText.match(/(?:Alojamiento|Hospedaje|Habitaci[oó]n)\s+([\d.,]+)\s*€/i);
  if (alojaMatch) importe_alojamiento = parseImporte(alojaMatch[1]);
  const extrasMatch = modalText.match(/(?:Complementos|Extras|Servicios|Suplementos)\s+([\d.,]+)\s*€/i);
  if (extrasMatch) importe_complementarios = parseImporte(extrasMatch[1]);
  // Si solo encontramos uno, derivar el otro
  if (importe_alojamiento === null && importe_complementarios > 0 && importe_total > 0) {
    importe_alojamiento = Math.max(0, importe_total - importe_complementarios);
  }
  // Si no encontramos nada, alojamiento = total (comportamiento previo migration 0016)
  if (importe_alojamiento === null) {
    importe_alojamiento = importe_total;
  }

  const pendienteMatch = modalText.match(/Pendiente de cobro\s+([\d.,]+)\s*€/i);
  const pendiente_cobro = pendienteMatch ? parseImporte(pendienteMatch[1]) : 0;

  const anticipoMatch = modalText.match(/Anticipo\s+(?:(Sin anticipo)|([\d.,]+)\s*€)/i);
  const anticipo = anticipoMatch && anticipoMatch[2] ? parseImporte(anticipoMatch[2]) : 0;

  let estado_cobro: EstadoCobro = 'pendiente';
  if (importe_total > 0 && pendiente_cobro === 0) estado_cobro = 'cobrado';
  else if (anticipo > 0 && pendiente_cobro > 0) estado_cobro = 'parcial';

  let estado_reserva: EstadoReserva = 'confirmada';
  if (modalText.match(/Reserva\s+anulada|estado:\s*Cancelada|Cancelada\s+por/i)) {
    estado_reserva = 'cancelada';
  } else if (fecha_out && new Date(fecha_out) < new Date()) {
    estado_reserva = 'completada';
  }

  const formaPagoMatch = modalText.match(/Forma de pago\s+(\w+)/i);
  const forma_pago = formaPagoMatch?.[1]?.toLowerCase() || null;

  const paxMatch = modalText.match(/(\d+)\s*pax/i) || modalText.match(/(\d+)P\s+Est/i);
  const num_huespedes = paxMatch ? parseInt(paxMatch[1], 10) : null;

  const comentarioMatch = modalText.match(/Comentario del Cliente:\s*([\s\S]+?)(?:Condiciones|---|$)/i);
  const observaciones = comentarioMatch?.[1]?.trim().substring(0, 500) || null;

  // === VALIDACIÓN ESTRICTA — schema SQL espera fechas válidas ===
  if (!id_reserva) {
    log.warning(`parseModalReserva: no id_reserva (text first 300: ${modalText.substring(0, 300)})`);
    return null;
  }
  if (!fecha_in || !fecha_out) {
    log.warning(`Reserva ${id_reserva}: fechas vacías (in=${fecha_in}, out=${fecha_out}) — descartada para evitar SQL error`);
    return null;
  }
  if (!habitacion) {
    log.warning(`Reserva ${id_reserva}: habitacion vacía — descartada`);
    return null;
  }
  if (importe_total === 0) {
    log.warning(`Reserva ${id_reserva}: importe_total = 0 — descartada (probable modal stale)`);
    return null;
  }
  if (!fecha_reserva) {
    log.warning(`Reserva ${id_reserva}: fecha_reserva vacía, usando fecha_in como fallback`);
  }

  // Líneas granulares de complementarios (Fase 2 · corrige bug MrPlan)
  // Formato observado en modal MrPlan:
  //   "LATA REFRESCO x 3 Habitación Margarita 12/07/2026 7,50 €"
  //   "Desayuno x 1 Habitación Margarita 0,00 €" (sin fecha si está incluido)
  const complementarios: Array<{ concepto: string; cantidad: number; fecha: string | null; importe: number; raw_text: string }> = [];
  try {
    // Buscar bloque "Otros servicios y descuentos" (o similar)
    const bloqueMatch = modalText.match(/Otros servicios y descuentos([\s\S]{0,5000}?)(?:Condiciones|Totales|Ver reserva|$)/i);
    if (bloqueMatch) {
      const bloque = bloqueMatch[1];
      // Regex: CONCEPTO x CANTIDAD [Habitación XXX] [dd/mm/yyyy] IMPORTE €
      const linRe = /([A-ZÁÉÍÓÚÑa-záéíóúñ][A-Za-záéíóúÁÉÍÓÚñÑ0-9\s\-_.]{1,80}?)\s+x\s+(\d+)\s+(?:Habitaci[oó]n\s+\S+\s+)?(\d{1,2}\/\d{1,2}\/\d{4})?\s*([\d.,]+)\s*€/g;
      let m: RegExpExecArray | null;
      while ((m = linRe.exec(bloque)) !== null) {
        const concepto = m[1].trim().replace(/\s+/g, ' ');
        const cantidad = parseInt(m[2], 10) || 1;
        const fechaRaw = m[3];
        const importe = parseImporte(m[4]);
        // Fecha en ISO
        let fecha: string | null = null;
        if (fechaRaw) {
          const parts = fechaRaw.split('/');
          if (parts.length === 3) {
            fecha = `${parts[2].padStart(4, '20')}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
        if (concepto && importe >= 0 && concepto.length < 100) {
          complementarios.push({ concepto, cantidad, fecha, importe, raw_text: m[0].slice(0, 200) });
        }
      }
    }
  } catch (e) {
    log.warning(`Reserva ${id_reserva}: fallo extrayendo complementarios: ${(e as Error).message}`);
  }
  if (complementarios.length > 0) {
    log.info(`Reserva ${id_reserva}: ${complementarios.length} líneas de complementarios extraídas`);
  }

  const reserva: ReservaScraped = {
    id_reserva,
    localizador_externo,
    canal,
    habitacion,
    fecha_in,
    fecha_out,
    noches,
    huesped_nombre: huesped_nombre || 'Sin nombre',
    huesped_apellidos,
    huesped_email,
    huesped_telefono,
    huesped_pais: null,
    huesped_documento: null,
    importe_total,
    importe_alojamiento,
    importe_complementarios,
    importe_moneda: 'EUR',
    anticipo,
    pendiente_cobro,
    estado_reserva,
    estado_cobro,
    forma_pago,
    factura_num: null,
    fecha_reserva: fecha_reserva || `${fecha_in}T00:00:00Z`,
    observaciones,
    num_huespedes,
    complementarios,
  } as any;

  return reserva;
}

