// Una reserva de MisterPlan con varias habitaciones son varias filas en
// `reservas` con el mismo id_externo_misterplan. La firma legal va por
// reserva, no por habitación (feedback Juan nov: una reserva de 6
// habitaciones generaba 6 procesos de firma).

export type FilaReserva = { id: string; habitacion: string; fecha_in: string; fecha_out: string; importe_total: number | null; id_externo_misterplan: string | null };

const COLUMNAS = "id, habitacion, fecha_in, fecha_out, importe_total, id_externo_misterplan";

/** Todas las filas (habitaciones) de la reserva a la que pertenece `reservaId`, sin anuladas. */
export async function filasDeLaReserva(supabase: any, reservaId: string): Promise<FilaReserva[]> {
  const { data: fila } = await supabase.from("reservas").select(COLUMNAS).eq("id", reservaId).maybeSingle();
  if (!fila) return [];
  if (!fila.id_externo_misterplan) return [fila];
  const { data } = await supabase
    .from("reservas")
    .select(COLUMNAS)
    .eq("id_externo_misterplan", fila.id_externo_misterplan)
    .not("estado_reserva", "in", "(cancelada,no_show)")
    .order("habitacion");
  const filas: FilaReserva[] = data ?? [];
  return filas.some((f) => f.id === fila.id) ? filas : [fila, ...filas];
}

/** "la habitación Nube" / "las habitaciones Nube, Lino y Cala". */
export function textoHabitaciones(habitaciones: string[]): string {
  const nombres = Array.from(new Set(habitaciones)).map((h) => h.charAt(0).toUpperCase() + h.slice(1));
  if (nombres.length <= 1) return `la habitación ${nombres[0] ?? ""}`.trim();
  return `las habitaciones ${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Agrupa filas por reserva de MisterPlan (las que no tienen id externo van solas). */
export function agruparPorReserva<T extends { id: string; id_externo_misterplan?: string | null }>(filas: T[]): T[][] {
  const grupos = new Map<string, T[]>();
  for (const f of filas) {
    const k = f.id_externo_misterplan || `id:${f.id}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return Array.from(grupos.values());
}
