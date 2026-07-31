-- Migration 0027 · Añadir canal 'telefono' + reclasificar Booking mal detectado
-- CONTEXTO: el scraper tenía un regex que no capturaba "Booking.com" (MrPlan lo escribe
-- con punto) → 200 reservas cayeron a 'otro'. Fix desplegado en el scraper.
-- Esta migration: (a) permite el nuevo canal 'telefono', (b) deja constancia del problema.

-- (a) Ampliar el CHECK de canal
ALTER TABLE public.reservas DROP CONSTRAINT IF EXISTS reservas_canal_check;
ALTER TABLE public.reservas ADD CONSTRAINT reservas_canal_check
  CHECK (canal IN ('directo','telefono','booking','airbnb','expedia','web_propia','walk_in','otro'));

COMMENT ON COLUMN public.reservas.canal IS
  'Canal de origen. telefono = reserva tomada por teléfono y metida a mano en MrPlan (petición Juan jul 2026). web_propia = motor web (MrPlan lo llama "Cloud (Mi web)"). booking = Booking.com.';

-- (b) Diagnóstico: cuántas reservas hay por canal ahora
SELECT canal, COUNT(*)::int AS reservas
FROM public.reservas
GROUP BY canal
ORDER BY COUNT(*) DESC;
