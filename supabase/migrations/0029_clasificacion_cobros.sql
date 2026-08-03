-- ============================================================================
-- Casa Mendilore · Clasificación de cobros para Tesorería
-- Petición Juan (WhatsApp 31 jul): "ni pendientes ni pagadas, sino como prepago"
-- + arreglo del CHECK de canal (el scraper ya manda 'telefono')
-- ============================================================================
-- Aplicar en Supabase SQL Editor → Run (todo de una vez)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ampliar CHECK de canal — el scraper 0.0.20 ya envía 'telefono'
--    (sin esto, las reservas telefónicas fallan al insertarse)
-- ----------------------------------------------------------------------------
ALTER TABLE public.reservas DROP CONSTRAINT IF EXISTS reservas_canal_check;
ALTER TABLE public.reservas ADD CONSTRAINT reservas_canal_check
  CHECK (canal IN ('directo','telefono','booking','airbnb','expedia','web_propia','walk_in','otro'));

COMMENT ON COLUMN public.reservas.canal IS
  'Canal de origen. telefono = reserva tomada por teléfono metida a mano en MrPlan. web_propia = motor web (MrPlan lo llama "Cloud (Mi web)"). booking = Booking.com.';

-- ----------------------------------------------------------------------------
-- 2) Vista clasificacion_cobros — cada reserva con su categoría de tesorería
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.clasificacion_cobros AS
SELECT
  r.id,
  r.id_externo_misterplan,
  r.habitacion,
  r.fecha_in,
  r.fecha_out,
  r.canal,
  r.forma_pago,
  r.estado_cobro,
  r.importe_total,
  COALESCE(r.anticipo, 0)          AS ya_cobrado,
  COALESCE(r.pendiente_cobro, 0)   AS por_cobrar,
  COALESCE(h.nombre || ' ' || COALESCE(h.apellidos,''), '—') AS huesped,
  CASE
    -- 1) PREPAGO OTA: lo cobra la plataforma, nos lo abona tras la salida
    WHEN r.canal = 'booking'
      OR r.forma_pago ~* 'booking[ _-]*payments|virtual[ _-]*card|virtualcard|prepago'
      THEN 'prepago_ota'
    -- 2) ANTICIPO WEB: 50% cobrado al reservar, resto a la salida
    WHEN r.canal = 'web_propia' AND COALESCE(r.pendiente_cobro,0) > 0
      THEN 'anticipo_web'
    -- 3) COBRADO por completo
    WHEN r.estado_cobro = 'cobrado' OR COALESCE(r.pendiente_cobro,0) = 0
      THEN 'cobrado'
    -- 4) PENDIENTE REAL: requiere gestión de cobro
    ELSE 'pendiente_gestion'
  END AS clasificacion,
  CASE
    WHEN r.canal = 'booking'
      OR r.forma_pago ~* 'booking[ _-]*payments|virtual[ _-]*card|virtualcard|prepago'
      THEN 'Prepago OTA · lo cobra la plataforma y os lo abona tras la salida'
    WHEN r.canal = 'web_propia' AND COALESCE(r.pendiente_cobro,0) > 0
      THEN 'Anticipo web · 50% cobrado al reservar, resto a la salida'
    WHEN r.estado_cobro = 'cobrado' OR COALESCE(r.pendiente_cobro,0) = 0
      THEN 'Cobrado por completo'
    ELSE 'Pendiente · requiere gestión de cobro'
  END AS descripcion
FROM public.reservas r
LEFT JOIN public.huespedes h ON h.id = r.huesped_id
WHERE r.estado_reserva NOT IN ('cancelada','no_show')
  AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda');

COMMENT ON VIEW public.clasificacion_cobros IS
  'Clasificación de cobros para tesorería (Juan, jul 2026): prepago_ota / anticipo_web / cobrado / pendiente_gestion. Las dos primeras NO requieren acción de cobro pero se controlan para tesorería.';

-- ----------------------------------------------------------------------------
-- 3) Vista resumen_tesoreria — el bloque que verá Juan en el panel
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.resumen_tesoreria AS
SELECT
  clasificacion,
  MIN(descripcion)                     AS descripcion,
  COUNT(*)::int                        AS num_reservas,
  ROUND(SUM(importe_total)::numeric, 2) AS importe_total,
  ROUND(SUM(ya_cobrado)::numeric, 2)    AS ya_cobrado,
  ROUND(SUM(por_cobrar)::numeric, 2)    AS por_cobrar
FROM public.clasificacion_cobros
WHERE fecha_out >= CURRENT_DATE - 90
GROUP BY clasificacion;

COMMENT ON VIEW public.resumen_tesoreria IS
  'Resumen de tesorería por categoría de cobro, últimos 90 días + futuro.';

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN — esto es lo que verás al ejecutar
-- ----------------------------------------------------------------------------
SELECT
  clasificacion,
  num_reservas,
  importe_total,
  ya_cobrado,
  por_cobrar
FROM public.resumen_tesoreria
ORDER BY importe_total DESC;
