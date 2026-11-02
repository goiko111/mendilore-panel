-- Migration 0037 · Descuentos sin fecha: restarlos en vez de perderlos
--
-- SÍNTOMA (02/11/2026)
--   Los consumos por día sumaban 39.056,00 € y las fichas 37.486,34 €:
--   1.569,66 € de más. El total del panel quedaba +0,3 % sobre MisterPlan.
--
-- CAUSA
--   compl_sin_fecha solo repartía las líneas sin fecha cuando su suma por
--   reserva era positiva (AND l.sin_fecha > 0). Las líneas negativas son
--   descuentos ("Descuento 10 % Reserva Directa", "Descuento 5%"…): si una
--   reserva solo tenía descuentos sin fecha, no se restaban nunca.
--
-- FIX
--   Repartir también las sumas negativas. Mismo resto de la vista que 0033.
--   Los descuentos siguen restando de complementarios, como en MisterPlan
--   (tratarlos como alojamiento alejaba el reparto de su informe).

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
    AND l.sin_fecha <> 0  -- también en negativo: son descuentos
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
  'Producción diaria. Alojamiento repartido entre noches. Complementarios: línea con fecha real al día que indica MrPlan; líneas sin fecha repartidas (también si suman en negativo: descuentos); y el resto no cubierto por líneas también repartido, para no perder importe cuando el desglose viene incompleto.';

-- Verificación: complementarios por días = fichas (37.486,34 € el 02/11)
SELECT ROUND(SUM(ingresos_complementarios), 2) AS complementarios
FROM public.produccion_dia;
