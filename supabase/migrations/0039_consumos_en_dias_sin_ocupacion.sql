-- Migration 0039 · Consumos en días sin habitaciones ocupadas + ADR propio
-- ---------------------------------------------------------------------------
-- 1) produccion_dia solo tenía filas para los días con alguna habitación
--    ocupada (salía de las noches de estancia). Un consumo con fecha de un día
--    sin ninguna habitación ocupada esa noche se perdía de todos los totales:
--    por ejemplo, una comida el día de salida con la casa vacía esa noche.
--    Ahora los días salen de las noches Y de las fechas de consumo.
--    Mismas columnas y mismo orden, así que metricas_dia y la Comparativa
--    siguen funcionando sin tocarlas. Un día solo con consumos sale con
--    0 habitaciones ocupadas.
--
-- 2) adr_propio_para_fecha (fila "Nosotros" de Competencia) usaba el importe
--    total (con consumos) y no filtraba las 6 habitaciones. Ahora es el precio
--    de alojamiento por noche, comparable con el de Booking de la competencia.
--
-- Antes de aplicar, para saber cuánto entra de nuevo:
--   SELECT c.fecha, SUM(c.importe) AS importe
--   FROM public.reserva_complementarios c
--   JOIN public.reservas r ON r.id = c.reserva_id
--   WHERE c.fecha IS NOT NULL
--     AND r.estado_reserva NOT IN ('cancelada', 'no_show')
--     AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
--     AND NOT EXISTS (SELECT 1 FROM public.produccion_dia p WHERE p.dia = c.fecha)
--   GROUP BY c.fecha ORDER BY c.fecha;

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
  SELECT c.fecha::date AS dia, SUM(c.importe) AS importe
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
-- (3) RESTO no cubierto por las líneas → repartido entre las noches
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
  SELECT dia, SUM(importe) AS importe
  FROM (
    SELECT dia, importe FROM compl_con_fecha
    UNION ALL
    SELECT dia, importe_por_noche FROM compl_sin_fecha
    UNION ALL
    SELECT dia, importe_por_noche FROM compl_resto
  ) x
  GROUP BY dia
),
aloj_dia AS (
  SELECT n.dia,
         COUNT(*)::int AS habitaciones_ocupadas,
         SUM(COALESCE(n.importe_alojamiento, 0) / NULLIF(n.noches, 0)) AS alojamiento,
         jsonb_object_agg(n.habitacion, 1) AS habitaciones,
         jsonb_object_agg(n.canal, 1) AS canales
  FROM noches_expandidas n
  GROUP BY n.dia
)
SELECT
  COALESCE(a.dia, c.dia)                                                AS dia,
  COALESCE(a.habitaciones_ocupadas, 0)                                  AS habitaciones_ocupadas,
  ROUND(COALESCE(a.alojamiento, 0)::numeric, 2)                         AS ingresos_alojamiento,
  ROUND(COALESCE(c.importe, 0)::numeric, 2)                             AS ingresos_complementarios,
  ROUND((COALESCE(a.alojamiento, 0) + COALESCE(c.importe, 0))::numeric, 2) AS ingresos_total,
  COALESCE(a.habitaciones, '{}'::jsonb)                                 AS habitaciones,
  COALESCE(a.canales, '{}'::jsonb)                                      AS canales
FROM aloj_dia a
FULL OUTER JOIN compl_dia c ON c.dia = a.dia
ORDER BY 1;

COMMENT ON VIEW public.produccion_dia IS
  'Producción diaria. Alojamiento repartido entre noches. Complementarios: línea con fecha real al día que indica MrPlan (aunque esa noche no haya ninguna habitación ocupada); líneas sin fecha repartidas (también si suman en negativo: descuentos); y el resto no cubierto por líneas también repartido.';

CREATE OR REPLACE FUNCTION public.adr_propio_para_fecha(p_fecha date)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT ROUND(AVG(
           COALESCE(NULLIF(importe_alojamiento, 0), importe_total - COALESCE(importe_complementarios, 0))
           / NULLIF(noches, 0)
         )::numeric, 2)
  FROM public.reservas
  WHERE estado_reserva NOT IN ('cancelada', 'no_show')
    AND habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
    AND fecha_in <= p_fecha
    AND fecha_out > p_fecha
    AND noches > 0
    AND importe_total > 0;
$$;

COMMENT ON FUNCTION public.adr_propio_para_fecha IS
  'Precio de alojamiento por noche (sin consumos) de Casa Mendilore para una noche concreta: media de las habitaciones ocupadas esa noche.';

-- Comprobación: días que ahora aparecen solo por consumos
SELECT dia, ingresos_complementarios
FROM public.produccion_dia
WHERE habitaciones_ocupadas = 0
ORDER BY dia;
