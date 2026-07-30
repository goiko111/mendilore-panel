-- Migration 0025 · Fix metricas_dia (feedback Juan 22 jul)
-- Bugs de la versión 0001:
--   (a) estado_reserva IN ('confirmada','completada') → excluía las 'pendiente' → noches vendidas 111 vs 166 reales
--   (b) ADR usaba importe_total (incluye consumos/cenas) → ADR inflado
--   (c) reservas solapadas duplicaban filas del JOIN → conteos incorrectos
-- Nueva definición:
--   · Cuenta TODAS las no canceladas/no-show
--   · ADR sobre importe_alojamiento (sin extras)
--   · DISTINCT ON para eliminar solapes por (fecha, habitacion)

DROP MATERIALIZED VIEW IF EXISTS public.metricas_dia;

CREATE MATERIALIZED VIEW public.metricas_dia AS
WITH calendario AS (
  SELECT
    d::date AS fecha,
    h AS habitacion
  FROM generate_series(current_date - interval '400 days', current_date + interval '90 days', interval '1 day') d
  CROSS JOIN unnest(array['cala', 'nube', 'margarita', 'lino', 'limonero', 'lavanda']) AS h
),
ocupacion AS (
  -- DISTINCT ON evita contar dos veces la misma habitación-noche si hay reservas solapadas
  SELECT DISTINCT ON (c.fecha, c.habitacion)
    c.fecha,
    c.habitacion,
    CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END AS ocupada,
    -- ADR real: solo la parte de alojamiento, repartida por noche
    COALESCE(COALESCE(r.importe_alojamiento, r.importe_total) / NULLIF(r.noches, 0), 0) AS ingreso_aloja_dia,
    COALESCE(r.importe_total / NULLIF(r.noches, 0), 0) AS ingreso_total_dia
  FROM calendario c
  LEFT JOIN public.reservas r ON
    r.habitacion = c.habitacion
    AND r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND c.fecha >= r.fecha_in
    AND c.fecha < r.fecha_out
  ORDER BY c.fecha, c.habitacion, r.fecha_in DESC NULLS LAST
)
SELECT
  fecha,
  count(*) AS habitaciones_totales,
  sum(ocupada) AS habitaciones_ocupadas,
  round(100.0 * sum(ocupada) / count(*), 2) AS occupancy_pct,
  round(sum(ingreso_total_dia)::numeric, 2) AS ingresos_dia,
  -- ADR = ingresos de ALOJAMIENTO / habitaciones ocupadas (sin extras — feedback Juan)
  round((CASE WHEN sum(ocupada) > 0 THEN sum(ingreso_aloja_dia) / sum(ocupada) ELSE 0 END)::numeric, 2) AS adr,
  -- RevPAR sobre alojamiento
  round((sum(ingreso_aloja_dia) / count(*))::numeric, 2) AS revpar
FROM ocupacion
GROUP BY fecha;

CREATE UNIQUE INDEX IF NOT EXISTS metricas_dia_fecha_idx ON public.metricas_dia(fecha);

-- Refresh inmediato para que el panel muestre los datos corregidos YA
REFRESH MATERIALIZED VIEW public.metricas_dia;

-- Verificación julio 2026: noches vendidas y ADR corregidos
SELECT
  'julio 2026' AS periodo,
  SUM(habitaciones_ocupadas) AS noches_vendidas,
  ROUND(AVG(occupancy_pct), 1) AS ocupacion_media_pct,
  ROUND(AVG(adr) FILTER (WHERE habitaciones_ocupadas > 0), 2) AS adr_medio
FROM public.metricas_dia
WHERE fecha BETWEEN '2026-07-01' AND '2026-07-31';
