-- Migration 0021 · Vista produccion_dia
-- Reparte importe_alojamiento e importe_complementarios entre las noches reales de estancia
-- Corrige el bug de MrPlan que atribuye complementarios a días equivocados

CREATE OR REPLACE VIEW public.produccion_dia AS
WITH noches_expandidas AS (
  SELECT
    r.id,
    r.habitacion,
    r.canal,
    r.estado_reserva,
    r.noches,
    r.importe_alojamiento,
    r.importe_complementarios,
    -- Genera una fila por cada noche del rango [fecha_in, fecha_out)
    generate_series(r.fecha_in, r.fecha_out - INTERVAL '1 day', INTERVAL '1 day')::date AS dia
  FROM public.reservas r
  WHERE r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
    AND r.noches > 0
    AND r.fecha_out > r.fecha_in
)
SELECT
  dia,
  COUNT(*)::int AS habitaciones_ocupadas,
  ROUND(SUM(COALESCE(importe_alojamiento, 0) / NULLIF(noches, 0))::numeric, 2) AS ingresos_alojamiento,
  ROUND(SUM(COALESCE(importe_complementarios, 0) / NULLIF(noches, 0))::numeric, 2) AS ingresos_complementarios,
  ROUND(SUM(
    (COALESCE(importe_alojamiento, 0) + COALESCE(importe_complementarios, 0)) / NULLIF(noches, 0)
  )::numeric, 2) AS ingresos_total,
  jsonb_object_agg(habitacion, 1) AS habitaciones,
  jsonb_object_agg(canal, 1) AS canales
FROM noches_expandidas
GROUP BY dia
ORDER BY dia;

COMMENT ON VIEW public.produccion_dia IS
  'Producción diaria real: reparte alojamiento y complementarios linealmente entre las noches de estancia de cada reserva. Corrige el bug del informe agregado de MrPlan que atribuye consumos/cenas a días equivocados.';
