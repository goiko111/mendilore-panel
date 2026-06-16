-- Migration 0015 v2 — Vista reservas_pendientes_firma (Fase 3 mejora 1/7)
-- Lista las reservas sin firma legal con días hasta check-in y nivel de urgencia
-- (La función evidencia_aceptacion se añadirá en 0016 tras verificar schema aceptaciones)

CREATE OR REPLACE VIEW public.reservas_pendientes_firma AS
SELECT
  r.id, r.habitacion, r.fecha_in, r.fecha_out, r.estado_cobro, r.canal, r.importe_total,
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
    SELECT 1 FROM public.aceptaciones_condiciones a WHERE a.reserva_id = r.id
  );

GRANT SELECT ON public.reservas_pendientes_firma TO authenticated, service_role;

SELECT 'Migration 0015 v2 aplicada' AS status;
