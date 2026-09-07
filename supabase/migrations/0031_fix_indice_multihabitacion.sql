-- Migration 0031 · Eliminar el índice único que impedía las reservas multi-habitación
--
-- SÍNTOMA
--   Ninguna reserva de 2+ habitaciones sobrevivía en la base de datos:
--     SELECT COUNT(*) FROM (SELECT id_externo_misterplan FROM reservas
--                           GROUP BY 1 HAVING COUNT(*)>1) x;   -->  0
--   En el panel, el 4-6 de agosto marcaba 5 habitaciones de 6 y faltaba "cala".
--
-- CAUSA
--   La migración 0026 arregló bien la FUNCIÓN (clave compuesta id_externo + habitacion),
--   pero quedó vivo un índice ÚNICO sobre id_externo_misterplan a solas, heredado de
--   antes. Con él, insertar la segunda habitación de una reserva viola la unicidad:
--   la fila se rechaza, el webhook lo anota como error y continúa. El scraper emitía
--   los datos correctos (log: "Reserva 1-7208722: MULTI-HABITACIÓN → 2 filas
--   (margarita, cala)") y se perdían al guardar.
--
-- FIX
--   Quitar el índice antiguo. uq_reservas_externo_habitacion, ya existente, aporta la
--   unicidad correcta: (id_externo_misterplan, habitacion).

-- 1) Comprobar que el índice compuesto existe ANTES de quitar el otro
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'reservas'
      AND indexname  = 'uq_reservas_externo_habitacion'
  ) THEN
    RAISE EXCEPTION 'Falta uq_reservas_externo_habitacion: no se puede quitar el índice antiguo sin dejar la tabla sin unicidad';
  END IF;
END $$;

-- 2) Eliminar el índice único sobre id_externo_misterplan a solas
DROP INDEX IF EXISTS public.idx_reservas_id_externo_misterplan;

-- 3) Índice NO único para mantener el rendimiento de las búsquedas por id externo
CREATE INDEX IF NOT EXISTS idx_reservas_id_externo_misterplan_nonunique
  ON public.reservas (id_externo_misterplan);

-- 4) Verificación: deben quedar reservas_pkey y uq_reservas_externo_habitacion,
--    y ningún índice único sobre id_externo_misterplan a solas
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'reservas' AND indexdef ILIKE '%UNIQUE%'
ORDER BY indexname;
