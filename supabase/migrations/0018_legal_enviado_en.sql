-- Migration 0018: timestamp de auto-envío del enlace legal
-- Fase 3 mejora 7/7 — Bloque 17 feedback Juan
-- Permite al cron `auto-envio-legal` no duplicar y al panel mostrar cuándo se envió.

ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS legal_enviado_en timestamptz;

CREATE INDEX IF NOT EXISTS idx_reservas_legal_enviado_en
  ON public.reservas(legal_enviado_en)
  WHERE legal_enviado_en IS NULL;  -- partial index: solo las pendientes

COMMENT ON COLUMN public.reservas.legal_enviado_en IS
  'Timestamp de cuándo el sistema envió automáticamente el enlace de aceptación de condiciones al huésped (cron auto-envio-legal).';
