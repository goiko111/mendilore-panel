-- Migration 0028 · FIX CRÍTICO · índice único parcial en huespedes.email
-- ============================================================================
-- SÍNTOMA: TODAS las inserciones de reservas fallaban silenciosamente con
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- CAUSA: la función upsert_reserva_misterplan usa
--   INSERT INTO huespedes ... ON CONFLICT (email) WHERE email IS NOT NULL
--   pero NO existía el índice único parcial que respalda esa cláusula.
--   El índice idx_huespedes_email existía pero NO era UNIQUE.
-- IMPACTO: desde que se aplicó la migration 0020, el panel dejó de ingerir
--   reservas nuevas. Las 324 existentes se habían insertado con la versión previa.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_huespedes_email_notnull
  ON public.huespedes (email)
  WHERE email IS NOT NULL;

COMMENT ON INDEX public.uq_huespedes_email_notnull IS
  'Índice único parcial requerido por ON CONFLICT (email) WHERE email IS NOT NULL en upsert_reserva_misterplan.';

-- Verificación
SELECT
  'índice único creado' AS resultado,
  EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'uq_huespedes_email_notnull')::text AS valor;
