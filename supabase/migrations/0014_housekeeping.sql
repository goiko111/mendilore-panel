-- Migration 0014 — Housekeeping (bloque 3 revisión Juan)
-- Permite trackear cambios de sábanas / toallas con histórico

CREATE TABLE IF NOT EXISTS public.housekeeping_cambios (
  id uuid primary key default gen_random_uuid(),
  habitacion text not null,
  tipo text not null check (tipo in ('sabanas', 'toallas')),
  reserva_id uuid references public.reservas(id) on delete set null,
  cambiado_en timestamptz not null default now(),
  cambiado_por text,
  notas text,
  creado_en timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS housekeeping_cambios_habitacion_idx ON public.housekeeping_cambios(habitacion, tipo, cambiado_en DESC);
CREATE INDEX IF NOT EXISTS housekeeping_cambios_reserva_idx ON public.housekeeping_cambios(reserva_id);

ALTER TABLE public.housekeeping_cambios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "housekeeping_cambios_authenticated" ON public.housekeeping_cambios;
CREATE POLICY "housekeeping_cambios_authenticated" ON public.housekeeping_cambios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Función: calcular noches consecutivas ocupadas por habitación
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
) LANGUAGE sql STABLE AS $$
  WITH activas AS (
    SELECT 
      r.habitacion,
      COALESCE(h.nombre || ' ' || COALESCE(h.apellidos, ''), '—') AS huesped,
      r.fecha_in,
      r.fecha_out,
      CURRENT_DATE - r.fecha_in::date AS noches_estancia
    FROM public.reservas r
    LEFT JOIN public.huespedes h ON h.id = r.huesped_id
    WHERE r.fecha_in <= CURRENT_DATE
      AND r.fecha_out > CURRENT_DATE
      AND r.estado_cobro != 'cancelado'
  ),
  ultimos AS (
    SELECT 
      hc.habitacion,
      hc.tipo,
      MAX(hc.cambiado_en) AS ultimo
    FROM public.housekeeping_cambios hc
    GROUP BY hc.habitacion, hc.tipo
  )
  SELECT 
    a.habitacion,
    a.huesped,
    a.fecha_in::date,
    a.noches_estancia::integer,
    GREATEST(0, a.noches_estancia::integer - COALESCE(
      EXTRACT(DAY FROM (CURRENT_DATE - us.ultimo::date))::integer, 
      a.noches_estancia::integer
    ))::integer AS noches_desde_ultimo_cambio_sabanas,
    GREATEST(0, a.noches_estancia::integer - COALESCE(
      EXTRACT(DAY FROM (CURRENT_DATE - ut.ultimo::date))::integer, 
      a.noches_estancia::integer
    ))::integer AS noches_desde_ultimo_cambio_toallas,
    us.ultimo,
    ut.ultimo
  FROM activas a
  LEFT JOIN ultimos us ON us.habitacion = a.habitacion AND us.tipo = 'sabanas'
  LEFT JOIN ultimos ut ON ut.habitacion = a.habitacion AND ut.tipo = 'toallas'
  ORDER BY a.noches_estancia DESC;
$$;

GRANT EXECUTE ON FUNCTION public.calcular_housekeeping_pendiente() TO authenticated, service_role;

SELECT 'Migration 0014 aplicada: housekeeping_cambios + función calcular_housekeeping_pendiente' AS status;
