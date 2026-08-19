-- Migration 0030 · Tesorería v2 (feedback Juan 10.08)
-- Casos: Álvaro (web propia, SIN anticipo → es pendiente real, no "anticipo 50%")
--        Gineke (cobro total el 19/7 → debe salir como cobrada)
-- Regla nueva: la clasificación usa el ANTICIPO REAL de la reserva, no el canal.

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
    -- 1) COBRADO: liquidado por completo (primero — Gineke cobrada tras requerimiento)
    WHEN r.estado_cobro = 'cobrado' OR COALESCE(r.pendiente_cobro,0) = 0
      THEN 'cobrado'
    -- 2) PREPAGO OTA: Booking Payments/tarjeta virtual — cobra la plataforma
    WHEN r.canal = 'booking'
      OR r.forma_pago ~* 'booking[ _-]*payments|virtual[ _-]*card|virtualcard|prepago'
      THEN 'prepago_ota'
    -- 3) ANTICIPO WEB: SOLO si hay anticipo real cobrado (>0) — no por canal
    WHEN COALESCE(r.anticipo,0) > 0
      THEN 'anticipo_web'
    -- 4) PENDIENTE REAL: sin anticipo y con importe por cobrar (caso Álvaro)
    ELSE 'pendiente_gestion'
  END AS clasificacion,
  CASE
    WHEN r.estado_cobro = 'cobrado' OR COALESCE(r.pendiente_cobro,0) = 0
      THEN 'Cobrado por completo'
    WHEN r.canal = 'booking'
      OR r.forma_pago ~* 'booking[ _-]*payments|virtual[ _-]*card|virtualcard|prepago'
      THEN 'Prepago OTA · lo cobra la plataforma y os lo abona tras la salida'
    WHEN COALESCE(r.anticipo,0) > 0
      THEN 'Anticipo cobrado · resto a la salida'
    ELSE 'Pendiente · requiere gestión de cobro'
  END AS descripcion
FROM public.reservas r
LEFT JOIN public.huespedes h ON h.id = r.huesped_id
WHERE r.estado_reserva NOT IN ('cancelada','no_show')
  AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda');

COMMENT ON VIEW public.clasificacion_cobros IS
  'v2 · Clasificación por ANTICIPO REAL: cobrado / prepago_ota / anticipo_web (solo si anticipo>0) / pendiente_gestion. Feedback Juan 10.08: Álvaro sin anticipo = pendiente real; Gineke cobrada = cobrado.';

-- resumen_tesoreria no cambia (usa clasificacion_cobros)

-- ============================================================================
-- DIAGNÓSTICO · casos concretos del feedback 10.08 (ejecutar y revisar salida)
-- ============================================================================
-- A) Álvaro y Gineke
SELECT 'CASO' AS bloque, h.nombre, r.habitacion, r.fecha_in, r.canal, r.anticipo, r.pendiente_cobro, r.estado_cobro, c.clasificacion
FROM public.reservas r
JOIN public.huespedes h ON h.id = r.huesped_id
JOIN public.clasificacion_cobros c ON c.id = r.id
WHERE h.nombre ~* 'alvaro|gineke|jose|gema|ignacio'
  AND r.fecha_in >= '2026-07-01'
ORDER BY h.nombre, r.fecha_in;
