-- Migration 0032 · Añadir 'parcial' al CHECK de estado_cobro
--
-- SÍNTOMA
--   Aproximadamente la MITAD de las reservas de cada mes no se guardaban ni se
--   actualizaban. En el log del webhook:
--     {"recibidas":58,"insertadas":3,"actualizadas":26,"errores":29,
--      "error":"new row for relation \"reservas\" violates check constraint"}
--
-- CAUSA
--   El scraper clasifica el cobro así (parse-modal.ts):
--     pendiente_cobro = 0                    -> 'cobrado'
--     anticipo > 0 y pendiente_cobro > 0     -> 'parcial'
--     resto                                  -> 'pendiente'
--   pero el CHECK creado en 0001_init nunca contempló 'parcial':
--     estado_cobro IN ('pendiente','cobrado','fallido','reembolsado','no_aplica')
--   Toda reserva con anticipo del 50% y resto a la salida —el caso habitual de
--   web propia en Casa Mendilore— era rechazada por la base de datos. El webhook
--   contaba el error y seguía, así que el fallo nunca fue visible.
--
-- CONSECUENCIAS QUE EXPLICA
--   · Reservas que no aparecían o se quedaban con datos viejos.
--   · El ~50% de filas que no se refrescaban en cada recarga.
--   · Segundas habitaciones de reservas multi-habitación que no llegaban a entrar.
--   · Descuadres de ocupación e ingresos en meses concretos.
--
-- 'parcial' es un estado legítimo y necesario para el bloque de Tesorería, así que
-- se amplía el CHECK en lugar de cambiar el scraper.

ALTER TABLE public.reservas DROP CONSTRAINT IF EXISTS reservas_estado_cobro_check;
ALTER TABLE public.reservas ADD CONSTRAINT reservas_estado_cobro_check
  CHECK (estado_cobro IN ('pendiente','parcial','cobrado','fallido','reembolsado','no_aplica'));

-- Verificación
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.reservas'::regclass
  AND conname = 'reservas_estado_cobro_check';
