-- Migration 0033 · Complementarios: no perder el importe agregado cuando hay líneas parciales
--
-- SÍNTOMA
--   Los consumos se hundían justo en los meses de más actividad:
--     may 1.719 € · jun 1.481 € · jul 1.612 € · ago 526 € · sep 255 €
--   Juan reporta que agosto 2026 fueron 3.981,55 € reales (y agosto 2025, 2.314,37 €),
--   de ahí el falso "-47,8 %" en la comparativa interanual.
--
-- CAUSA
--   La vista produccion_dia (migración 0022) solo aplica el reparto del importe
--   agregado (reservas.importe_complementarios) cuando la reserva NO tiene ninguna
--   línea en reserva_complementarios:
--       AND NOT EXISTS (SELECT 1 FROM reserva_complementarios c WHERE c.reserva_id = r.id)
--   Desde que el scraper extrae líneas granulares, casi todas las reservas tienen
--   al menos una — con frecuencia una sola de 0,00 € ("Desayuno x 1 ... 0,00 €",
--   visible en los logs). Con esa línea presente el fallback se desactiva y el
--   importe real de consumos de esa reserva se pierde por completo.
--   Los meses antiguos, escrapeados antes de existir el desglose, no tienen líneas
--   y por eso sí conservaban su importe: de ahí el patrón invertido.
--
-- FIX
--   Las líneas dejan de ser excluyentes. Se imputan las líneas donde toque y, si su
--   suma es MENOR que el importe agregado de la reserva, la diferencia se reparte
--   entre las noches de la estancia. Nunca se pierde importe y nunca se duplica.

CREATE OR REPLACE VIEW public.produccion_dia AS
WITH noches_expandidas AS (
  SELECT
    r.id, r.habitacion, r.canal, r.estado_reserva, r.noches,
    r.importe_alojamiento,
    generate_series(r.fecha_in, r.fecha_out - INTERVAL '1 day', INTERVAL '1 day')::date AS dia
  FROM public.reservas r
  WHERE r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
    AND r.noches > 0
    AND r.fecha_out > r.fecha_in
),
-- Suma de líneas por reserva, separando las que llevan fecha de las que no
lineas_por_reserva AS (
  SELECT c.reserva_id,
         COALESCE(SUM(c.importe) FILTER (WHERE c.fecha IS NOT NULL), 0) AS con_fecha,
         COALESCE(SUM(c.importe) FILTER (WHERE c.fecha IS NULL), 0)     AS sin_fecha,
         COALESCE(SUM(c.importe), 0)                                     AS total_lineas
  FROM public.reserva_complementarios c
  GROUP BY c.reserva_id
),
-- (1) Líneas CON fecha real → al día que indica MisterPlan
compl_con_fecha AS (
  SELECT c.fecha AS dia, SUM(c.importe) AS importe
  FROM public.reserva_complementarios c
  JOIN public.reservas r ON r.id = c.reserva_id
  WHERE c.fecha IS NOT NULL
    AND r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
  GROUP BY c.fecha
),
-- (2) Líneas SIN fecha → repartidas entre las noches de la estancia
compl_sin_fecha AS (
  SELECT r.id AS reserva_id,
         generate_series(r.fecha_in, r.fecha_out - INTERVAL '1 day', INTERVAL '1 day')::date AS dia,
         l.sin_fecha / NULLIF(r.noches, 0) AS importe_por_noche
  FROM public.reservas r
  JOIN lineas_por_reserva l ON l.reserva_id = r.id
  WHERE r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
    AND r.noches > 0 AND r.fecha_out > r.fecha_in
    AND l.sin_fecha > 0
),
-- (3) RESTO no cubierto por las líneas → repartido entre las noches.
--     Aquí está el arreglo: antes esto solo existía si la reserva no tenía
--     NINGUNA línea; ahora cubre también las que tienen líneas incompletas.
compl_resto AS (
  SELECT r.id AS reserva_id,
         generate_series(r.fecha_in, r.fecha_out - INTERVAL '1 day', INTERVAL '1 day')::date AS dia,
         (COALESCE(r.importe_complementarios, 0) - COALESCE(l.total_lineas, 0))
           / NULLIF(r.noches, 0) AS importe_por_noche
  FROM public.reservas r
  LEFT JOIN lineas_por_reserva l ON l.reserva_id = r.id
  WHERE r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
    AND r.noches > 0 AND r.fecha_out > r.fecha_in
    AND COALESCE(r.importe_complementarios, 0) - COALESCE(l.total_lineas, 0) > 0.01
),
compl_dia AS (
  SELECT dia, importe FROM compl_con_fecha
  UNION ALL
  SELECT dia, importe_por_noche FROM compl_sin_fecha
  UNION ALL
  SELECT dia, importe_por_noche FROM compl_resto
)
SELECT
  n.dia,
  COUNT(*)::int AS habitaciones_ocupadas,
  ROUND(SUM(COALESCE(n.importe_alojamiento, 0) / NULLIF(n.noches, 0))::numeric, 2) AS ingresos_alojamiento,
  ROUND(COALESCE((SELECT SUM(importe) FROM compl_dia c WHERE c.dia = n.dia), 0)::numeric, 2) AS ingresos_complementarios,
  ROUND((
    SUM(COALESCE(n.importe_alojamiento, 0) / NULLIF(n.noches, 0)) +
    COALESCE((SELECT SUM(importe) FROM compl_dia c WHERE c.dia = n.dia), 0)
  )::numeric, 2) AS ingresos_total,
  jsonb_object_agg(n.habitacion, 1) AS habitaciones,
  jsonb_object_agg(n.canal, 1) AS canales
FROM noches_expandidas n
GROUP BY n.dia
ORDER BY n.dia;

COMMENT ON VIEW public.produccion_dia IS
  'Producción diaria. Alojamiento repartido entre noches. Complementarios: línea con fecha real al día que indica MrPlan; líneas sin fecha repartidas; y el resto no cubierto por líneas también repartido, para no perder importe cuando el desglose viene incompleto.';

-- Verificación: agosto 2026 debería acercarse a los 3.981,55 € reales
SELECT to_char(dia,'YYYY-MM') AS mes,
       ROUND(SUM(ingresos_complementarios),2) AS complementarios,
       ROUND(SUM(ingresos_alojamiento),2)     AS alojamiento
FROM public.produccion_dia
WHERE dia >= '2025-07-01'
GROUP BY 1 ORDER BY 1;
