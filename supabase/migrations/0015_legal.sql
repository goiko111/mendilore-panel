-- Migration 0015 — Mejoras Fase 3 (bloque 17 revisión Juan)
-- Vista que muestra reservas pendientes de firma legal con info de check-in

CREATE OR REPLACE VIEW public.reservas_pendientes_firma AS
SELECT
  r.id,
  r.habitacion,
  r.fecha_in,
  r.fecha_out,
  r.estado_cobro,
  r.canal,
  r.importe_total,
  COALESCE(h.nombre || ' ' || COALESCE(h.apellidos, ''), '—') AS huesped,
  h.email AS huesped_email,
  (r.fecha_in::date - CURRENT_DATE)::integer AS dias_hasta_checkin,
  CASE
    WHEN r.fecha_in::date - CURRENT_DATE <= 0 THEN 'critica'
    WHEN r.fecha_in::date - CURRENT_DATE <= 1 THEN 'alta'
    WHEN r.fecha_in::date - CURRENT_DATE <= 7 THEN 'media'
    ELSE 'baja'
  END AS urgencia
FROM public.reservas r
LEFT JOIN public.huespedes h ON h.id = r.huesped_id
WHERE r.estado_cobro != 'cancelado'
  AND r.fecha_in >= CURRENT_DATE - INTERVAL '7 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.aceptaciones_condiciones a
    WHERE a.reserva_id = r.id
  );

GRANT SELECT ON public.reservas_pendientes_firma TO authenticated, service_role;

-- Función para regenerar PDF probatorio de una aceptación (reconstruye el doc tal cual lo firmó el huésped)
CREATE OR REPLACE FUNCTION public.evidencia_aceptacion(p_aceptacion_id uuid)
RETURNS TABLE (
  aceptacion_id uuid,
  reserva_id uuid,
  huesped_nombre text,
  documento_tipo text,
  documento_titulo text,
  documento_version text,
  documento_contenido text,
  documento_hash text,
  ip_origen text,
  user_agent text,
  firmado_en timestamptz
) LANGUAGE sql STABLE AS $func$
  SELECT
    a.id AS aceptacion_id,
    a.reserva_id,
    COALESCE(h.nombre || ' ' || COALESCE(h.apellidos, ''), '—') AS huesped_nombre,
    d.tipo AS documento_tipo,
    d.titulo AS documento_titulo,
    d.version AS documento_version,
    d.contenido AS documento_contenido,
    d.hash_sha256 AS documento_hash,
    a.ip_origen::text,
    a.user_agent,
    a.firmado_en
  FROM public.aceptaciones_condiciones a
  JOIN public.documentos_legales d ON d.id = a.documento_id
  LEFT JOIN public.reservas r ON r.id = a.reserva_id
  LEFT JOIN public.huespedes h ON h.id = r.huesped_id
  WHERE a.id = p_aceptacion_id;
$func$;

GRANT EXECUTE ON FUNCTION public.evidencia_aceptacion(uuid) TO authenticated, service_role;

SELECT 'Migration 0015 aplicada (Fase 3 mejoras)' AS status;
