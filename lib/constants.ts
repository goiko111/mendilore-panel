/**
 * Constantes globales del panel — Casa Mendilore.
 *
 * HABITACIONES_VALIDAS: lista oficial de las 6 habitaciones reales.
 * MisterPlan crea una línea adicional "Alojamiento completo" para reservas
 * de uso exclusivo de la casa entera. Esa línea NO es una habitación real
 * y debe excluirse de cualquier cálculo de ocupación, ADR, etc.
 */
export const HABITACIONES_VALIDAS = ["cala", "nube", "margarita", "lino", "limonero", "lavanda"] as const;
export const NUM_HABITACIONES = HABITACIONES_VALIDAS.length;
export type Habitacion = typeof HABITACIONES_VALIDAS[number];

/**
 * Devuelve true si una habitación es una de las 6 reales (no "Alojamiento completo" ni otro tipo).
 * Normaliza a lowercase para tolerar variaciones de MisterPlan.
 */
export function esHabitacionReal(h: string | null | undefined): boolean {
  if (!h) return false;
  return HABITACIONES_VALIDAS.includes(h.toLowerCase() as Habitacion);
}
