/**
 * Utility helpers para parseo, normalización y mapeo de datos de MisterPlan
 * al schema Supabase del panel.
 *
 * Todas las funciones aquí son PURAS y testeables sin browser.
 */

import type { Canal, EstadoCobro, EstadoReserva, Habitacion } from './types.js';

/* ---------------------------------- Canales --------------------------------- */

const CHANNEL_KEYWORDS: Array<[string, Canal]> = [
  ['cloud (mi web)', 'web_propia'],
  ['mi web', 'web_propia'],
  ['web propia', 'web_propia'],
  ['booking.com', 'booking'],
  ['booking', 'booking'],
  ['airbnb', 'airbnb'],
  ['expedia', 'expedia'],
  ['hotels.com', 'expedia'],
  ['walk-in', 'walk_in'],
  ['walkin', 'walk_in'],
  ['walk in', 'walk_in'],
  ['directa', 'directo'],
  ['directo', 'directo'],
  ['email', 'directo'],
  ['teléfono', 'directo'],
  ['telefono', 'directo'],
  ['whatsapp', 'directo'],
];

export function mapCanal(raw: string | null | undefined): Canal {
  if (!raw) return 'otro';
  const low = raw.toLowerCase().trim();
  for (const [needle, canal] of CHANNEL_KEYWORDS) {
    if (low.includes(needle)) return canal;
  }
  return 'otro';
}

/* -------------------------------- Habitaciones ------------------------------ */

const HABITACIONES_VALIDAS: ReadonlyArray<Habitacion> = [
  'cala', 'nube', 'margarita', 'lino', 'limonero', 'lavanda',
];

export function normalizeHabitacion(raw: string | null | undefined): string {
  if (!raw) return 'otro';
  const low = raw.toLowerCase().trim();
  // intento match contra las 6 habitaciones conocidas
  for (const h of HABITACIONES_VALIDAS) {
    if (low.includes(h)) return h;
  }
  // si MisterPlan usa "habitación 1" → conservar tal cual pero limpio
  return low.replace(/\s+/g, ' ').slice(0, 40);
}

/* ---------------------------------- Importes -------------------------------- */

/** Parsea "745,00 €", "1.234,56€", "€745" → number en EUR */
export function parseEuros(text: string | null | undefined): number {
  if (!text) return 0;
  const cleaned = text
    .replace(/[€$\s]/g, '')
    .replace(/\./g, '')    // los puntos en formato español son separadores de miles
    .replace(',', '.');    // y la coma es decimal
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function detectMoneda(text: string | null | undefined): string {
  if (!text) return 'EUR';
  if (text.includes('€') || /\bEUR\b/i.test(text)) return 'EUR';
  if (text.includes('$') || /\bUSD\b/i.test(text)) return 'USD';
  if (text.includes('£') || /\bGBP\b/i.test(text)) return 'GBP';
  return 'EUR';
}

/* ----------------------------------- Fechas --------------------------------- */

/** Parsea "04/06/2026" → "2026-06-04" (ISO YYYY-MM-DD) */
export function parseDateESP(text: string | null | undefined): string {
  if (!text) return '';
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  const d = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  return `${m[3]}-${mm}-${d}`;
}

/** Parsea "04/06/2026 10:26:35" → ISO 8601 "2026-06-04T10:26:35Z" */
export function parseDateTimeESP(text: string | null | undefined): string {
  if (!text) return '';
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const dateOnly = parseDateESP(text);
    return dateOnly ? `${dateOnly}T00:00:00Z` : '';
  }
  const d = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const h = m[4].padStart(2, '0');
  const min = m[5].padStart(2, '0');
  const s = (m[6] ?? '00').padStart(2, '0');
  return `${m[3]}-${mm}-${d}T${h}:${min}:${s}Z`;
}

/** Calcula noches entre dos ISO dates (exclusivo el out) */
export function diffNoches(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn + 'T00:00:00Z').getTime();
  const b = new Date(checkOut + 'T00:00:00Z').getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/* ----------------------------------- Estado --------------------------------- */

export function calcEstadoCobro(
  importeTotal: number,
  anticipo: number,
  pendienteCobro: number
): EstadoCobro {
  if (importeTotal <= 0) return 'no_aplica' as EstadoCobro;  // edge case
  // Tolerancia 0.01 € para evitar problemas de redondeo
  const eps = 0.01;
  if (pendienteCobro <= eps) return 'cobrado';
  if (anticipo > eps && pendienteCobro < importeTotal - eps) return 'parcial';
  return 'pendiente';
}

export function inferEstadoReserva(
  fechaIn: string,
  fechaOut: string,
  cancelada: boolean,
  noShow: boolean
): EstadoReserva {
  if (cancelada) return 'cancelada';
  if (noShow) return 'no_show';
  const today = new Date().toISOString().slice(0, 10);
  if (fechaOut && fechaOut < today) return 'completada';
  return 'confirmada';
}

/* ----------------------------------- Nombres -------------------------------- */

/** Divide "Stefan Watson" → { nombre: "Stefan", apellidos: "Watson" }
 *  "María José Pérez García" → { nombre: "María José", apellidos: "Pérez García" } */
export function splitNombre(full: string | null | undefined): { nombre: string; apellidos: string | null } {
  if (!full) return { nombre: '', apellidos: null };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { nombre: '', apellidos: null };
  if (parts.length === 1) return { nombre: parts[0], apellidos: null };
  // heurística simple: si hay 4+ partes, asumimos 2 nombre + 2 apellidos
  if (parts.length >= 4) {
    return {
      nombre: parts.slice(0, parts.length - 2).join(' '),
      apellidos: parts.slice(-2).join(' '),
    };
  }
  // 2 o 3 partes: primero es nombre, resto apellidos
  return {
    nombre: parts[0],
    apellidos: parts.slice(1).join(' '),
  };
}

/* ----------------------------------- País ----------------------------------- */

const PAIS_CODES: Record<string, string> = {
  'españa': 'ES', 'spain': 'ES', 'es': 'ES',
  'francia': 'FR', 'france': 'FR', 'fr': 'FR',
  'alemania': 'DE', 'germany': 'DE', 'de': 'DE',
  'reino unido': 'GB', 'united kingdom': 'GB', 'uk': 'GB', 'gb': 'GB',
  'estados unidos': 'US', 'united states': 'US', 'usa': 'US', 'us': 'US',
  'italia': 'IT', 'italy': 'IT', 'it': 'IT',
  'portugal': 'PT', 'pt': 'PT',
  'países bajos': 'NL', 'netherlands': 'NL', 'nl': 'NL', 'holanda': 'NL',
  'bélgica': 'BE', 'belgium': 'BE', 'be': 'BE',
  'irlanda': 'IE', 'ireland': 'IE', 'ie': 'IE',
};

export function normalizePais(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const low = raw.toLowerCase().trim();
  return PAIS_CODES[low] ?? (raw.length === 2 ? raw.toUpperCase() : raw);
}

/* ---------------------------------- ID parser ------------------------------- */

/** Extrae el ID MisterPlan tipo "1-7328706" o "Reserva 7328706" del texto del modal */
export function parseIdReserva(text: string | null | undefined): string | null {
  if (!text) return null;
  // patrón 1: "1-7328706"
  const m1 = text.match(/(\d+-\d{4,})/);
  if (m1) return m1[1];
  // patrón 2: "Reserva 7328706" o "Reserva #7328706"
  const m2 = text.match(/reserva\s*#?\s*(\d{4,})/i);
  if (m2) return `1-${m2[1]}`;
  return null;
}
