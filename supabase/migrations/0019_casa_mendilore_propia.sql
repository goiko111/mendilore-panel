-- Migration 0019: Casa Mendilore como entidad propia en competidores
-- Bloque 10 feedback Juan — "que aparezca Casa Mendilore al lado para comparar"
-- En lugar de scrapear nuestro propio Booking (que es self-referencing y poco fiable),
-- usamos el ADR REAL que estamos cobrando, calculado desde la tabla reservas.

ALTER TABLE public.competidores
  ADD COLUMN IF NOT EXISTS es_propia boolean NOT NULL DEFAULT false;

-- Insertar Casa Mendilore si no existe ya
INSERT INTO public.competidores (nombre, booking_url, estrellas, activo, es_propia)
SELECT 'Casa Mendilore', 'https://www.casamendilore.com', 4, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.competidores WHERE es_propia = true
);

-- Función para calcular ADR real propio para una fecha de check-in
-- Devuelve EUR/noche del promedio de reservas confirmadas con check_in <= fecha < check_out
CREATE OR REPLACE FUNCTION public.adr_propio_para_fecha(p_fecha date)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT ROUND(AVG(importe_total / NULLIF(noches, 0))::numeric, 2)
  FROM public.reservas
  WHERE estado_reserva NOT IN ('cancelada', 'no_show')
    AND fecha_in <= p_fecha
    AND fecha_out > p_fecha
    AND noches > 0
    AND importe_total > 0;
$$;

COMMENT ON FUNCTION public.adr_propio_para_fecha IS
  'ADR real propio en EUR/noche para una fecha de noche concreta — usa todas las reservas activas que cubren esa noche.';

COMMENT ON COLUMN public.competidores.es_propia IS
  'Si es true, la fila representa Casa Mendilore (entidad propia). Sus precios no se scrapean, se calculan desde la tabla reservas.';
