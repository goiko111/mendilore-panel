-- Migration 0017: tabla de control de recordatorios de firma enviados
-- Fase 3 mejora 3/7 — Bloque 17 feedback Juan
-- Evita enviar el mismo recordatorio -7/-3/-1d más de una vez por reserva.

CREATE TABLE IF NOT EXISTS public.aceptaciones_recordatorios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id uuid NOT NULL REFERENCES public.reservas(id) ON DELETE CASCADE,
  dias_offset integer NOT NULL CHECK (dias_offset IN (1, 3, 7)),
  email_destino text NOT NULL,
  enviado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_reserva_offset UNIQUE (reserva_id, dias_offset)
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_reserva ON public.aceptaciones_recordatorios(reserva_id);
CREATE INDEX IF NOT EXISTS idx_recordatorios_enviado_en ON public.aceptaciones_recordatorios(enviado_en DESC);

-- RLS: solo lectura para usuarios autenticados, escritura solo service_role
ALTER TABLE public.aceptaciones_recordatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura autenticados" ON public.aceptaciones_recordatorios
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.aceptaciones_recordatorios IS
  'Bitácora de recordatorios automáticos de firma legal enviados al huésped a -7/-3/-1d del check-in. Evita duplicados.';
