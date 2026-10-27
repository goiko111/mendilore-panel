-- Migration 0035 · 'telefono' también como origen del huésped
--
-- La 0027 añadió 'telefono' al CHECK de reservas.canal, pero no al de
-- huespedes.fuente (definido en la 0001). El upsert inserta primero el
-- huésped con fuente = canal, así que en cuanto el robot empezó a clasificar
-- las reservas "Cloud" de MisterPlan como teléfono, todas se rechazaban.
-- Lo detectó la escalada de errores del webhook (lote con 20 % de rechazos).

ALTER TABLE public.huespedes DROP CONSTRAINT IF EXISTS huespedes_fuente_check;
ALTER TABLE public.huespedes ADD CONSTRAINT huespedes_fuente_check
  CHECK (fuente IN ('directo','telefono','booking','airbnb','expedia','web_propia','walk_in','otro'));

-- Idempotente: por si la 0027 no se llegó a aplicar
ALTER TABLE public.reservas DROP CONSTRAINT IF EXISTS reservas_canal_check;
ALTER TABLE public.reservas ADD CONSTRAINT reservas_canal_check
  CHECK (canal IN ('directo','telefono','booking','airbnb','expedia','web_propia','walk_in','otro'));
