-- Migration 0016 — Desglose ingresos alojamiento/extras + función evidencia_aceptacion
-- Bloque 2.6 (separación ingresos) + bloque 17 (Fase 3 mejora reconstrucción evidencia) revisión Juan

-- ========================================================================
-- 1) Desglose de ingresos: alojamiento vs complementarios
-- ========================================================================
-- Por defecto importe_alojamiento = importe_total y complementarios = 0.
-- Cuando el scraper MrPlan empiece a parsear el desglose, se irá actualizando.
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS importe_alojamiento numeric(10,2),
  ADD COLUMN IF NOT EXISTS importe_complementarios numeric(10,2) NOT NULL DEFAULT 0;

UPDATE public.reservas
SET importe_alojamiento = importe_total
WHERE importe_alojamiento IS NULL;

COMMENT ON COLUMN public.reservas.importe_alojamiento IS 'Importe del alojamiento puro (habitación). Inicializado a importe_total. Actualizado por el scraper cuando MrPlan exponga el desglose.';
COMMENT ON COLUMN public.reservas.importe_complementarios IS 'Importe de desayunos, cenas, extras. 0 por defecto. Lo rellena el scraper cuando MrPlan exponga el desglose.';

-- ========================================================================
-- 2) Función evidencia_aceptacion (Fase 3 mejora 6/7)
-- Reconstruye la evidencia jurídica de una aceptación para descarga como PDF.
-- ========================================================================
CREATE OR REPLACE FUNCTION public.evidencia_aceptacion(p_aceptacion_id uuid)
RETURNS TABLE (
  aceptacion_id uuid,
  reserva_id uuid,
  huesped_nombre text,
  huesped_email text,
  documento_tipo text,
  documento_titulo text,
  documento_version text,
  documento_contenido text,
  documento_hash text,
  ip_cliente text,
  user_agent text,
  url_pagina text,
  metodo text,
  aceptado_en timestamptz
) LANGUAGE sql STABLE AS $func$
  SELECT
    a.id AS aceptacion_id,
    a.reserva_id,
    COALESCE(a.huesped_nombre_capturado, '—') AS huesped_nombre,
    a.huesped_email_capturado AS huesped_email,
    a.documento_tipo,
    d.titulo AS documento_titulo,
    a.documento_version,
    d.contenido AS documento_contenido,
    a.documento_hash_sha256 AS documento_hash,
    a.ip_cliente::text,
    a.user_agent,
    a.url_pagina,
    a.metodo,
    a.aceptado_en
  FROM public.aceptaciones_condiciones a
  LEFT JOIN public.documentos_legales d ON d.id = a.documento_legal_id
  WHERE a.id = p_aceptacion_id;
$func$;

GRANT EXECUTE ON FUNCTION public.evidencia_aceptacion(uuid) TO authenticated, service_role;

SELECT 'Migration 0016 aplicada (desglose ingresos + evidencia_aceptacion)' AS status;
