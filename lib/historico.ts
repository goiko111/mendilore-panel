/**
 * Desde cuándo hay datos cargados de MisterPlan.
 *
 * El histórico se cargó a partir de junio de 2025 (primera noche: 30/05/2025,
 * de estancias que entraban en junio). Antes de esa fecha no hay nada, así que
 * cualquier total o comparativa que empiece antes sale corto (feedback Juan
 * 21/11: año 2025 y comparativas YoY de enero a mayo).
 *
 * Se calcula con la primera noche ocupada de `produccion_dia`. Si no cae en
 * día 1, el mes de esa noche está incompleto (solo trae las estancias que
 * siguen en el mes siguiente) y se toma el día 1 del mes siguiente. Si algún
 * día se carga más histórico, la fecha se mueve sola.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function inicioHistorico(supabase: any): Promise<string | null> {
  const { data, error } = await supabase
    .from("produccion_dia")
    .select("dia")
    .gt("habitaciones_ocupadas", 0)
    .gt("dia", "2001-01-01") // fuera la fila de prueba diag-selftest (2000-01-01)
    .order("dia", { ascending: true })
    .limit(1);
  if (error || !data?.[0]?.dia) return null;
  const dia = String(data[0].dia).slice(0, 10);
  if (dia.endsWith("-01")) return dia;
  const [y, m] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // día 1 del mes siguiente
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2025-06-01" → "junio de 2025" */
export function mesYAnio(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MESES[m - 1]} de ${y}`;
}

/** "2025-06-01" → "01/06/2025" */
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
