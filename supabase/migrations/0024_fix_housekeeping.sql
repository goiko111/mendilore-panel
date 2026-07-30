-- Migration 0024 · Fix housekeeping (bug lavanda reportado por Juan 22 jul)
-- Problemas de la v2:
--   (a) filtraba por estado_cobro != 'cancelado' (valor inexistente) → canceladas contaban como activas
--   (b) si hay varias reservas solapadas para la misma habitación (histórico), tomaba todas → noches infladas
--   (c) no excluía "Alojamiento completo"
-- Regla correcta: contar noches desde GREATEST(check-in del huésped ACTUAL, último cambio).
-- Entre huéspedes siempre se cambian sábanas → una reserva de 1 noche jamás genera aviso.

CREATE OR REPLACE FUNCTION public.calcular_housekeeping_pendiente()
RETURNS TABLE (
  habitacion text,
  huesped text,
  fecha_in date,
  noches_consecutivas integer,
  noches_desde_ultimo_cambio_sabanas integer,
  noches_desde_ultimo_cambio_toallas integer,
  ultimo_cambio_sabanas timestamptz,
  ultimo_cambio_toallas timestamptz
) LANGUAGE sql STABLE AS $func$
  WITH activas AS (
    SELECT DISTINCT ON (r.habitacion)
      r.habitacion,
      COALESCE(h.nombre || ' ' || COALESCE(h.apellidos, ''), '—') AS huesped,
      r.fecha_in::date AS fecha_in_d,
      r.fecha_out::date AS fecha_out_d,
      (CURRENT_DATE - r.fecha_in::date)::integer AS noches_estancia
    FROM public.reservas r
    LEFT JOIN public.huespedes h ON h.id = r.huesped_id
    WHERE r.fecha_in <= CURRENT_DATE
      AND r.fecha_out > CURRENT_DATE
      AND r.estado_reserva NOT IN ('cancelada', 'no_show')
      AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
    ORDER BY r.habitacion, r.fecha_in DESC  -- si hay solapes, la reserva más reciente es la real
  ),
  ultimos AS (
    SELECT hc.habitacion, hc.tipo, MAX(hc.cambiado_en) AS ultimo
    FROM public.housekeeping_cambios hc
    GROUP BY hc.habitacion, hc.tipo
  )
  SELECT
    a.habitacion,
    a.huesped,
    a.fecha_in_d AS fecha_in,
    a.noches_estancia,
    -- Noches desde el último "reset": cambio registrado O llegada del huésped actual (lo más reciente)
    (CURRENT_DATE - GREATEST(a.fecha_in_d, COALESCE(us.ultimo::date, a.fecha_in_d)))::integer AS noches_desde_ultimo_cambio_sabanas,
    (CURRENT_DATE - GREATEST(a.fecha_in_d, COALESCE(ut.ultimo::date, a.fecha_in_d)))::integer AS noches_desde_ultimo_cambio_toallas,
    us.ultimo,
    ut.ultimo
  FROM activas a
  LEFT JOIN ultimos us ON us.habitacion = a.habitacion AND us.tipo = 'sabanas'
  LEFT JOIN ultimos ut ON ut.habitacion = a.habitacion AND ut.tipo = 'toallas'
  ORDER BY a.noches_estancia DESC;
$func$;

GRANT EXECUTE ON FUNCTION public.calcular_housekeeping_pendiente() TO authenticated, service_role;

-- Verificación: mostrar el estado actual
SELECT * FROM public.calcular_housekeeping_pendiente();
