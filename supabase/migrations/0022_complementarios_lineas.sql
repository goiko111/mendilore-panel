-- Migration 0022 · Líneas granulares de complementarios con fecha real
-- Extrae "LATA REFRESCO x 3 · 12/07/2026 · 7,50 €" del modal MrPlan
-- Corrige el bug de MrPlan que atribuye consumos a días equivocados en el informe agregado

-- ============================================================================
-- Tabla de líneas de complementarios
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reserva_complementarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id uuid NOT NULL REFERENCES public.reservas(id) ON DELETE CASCADE,
  concepto text NOT NULL,
  cantidad integer NOT NULL DEFAULT 1,
  fecha date,  -- puede ser NULL si el complemento no tiene fecha explícita
  importe numeric(10,2) NOT NULL,
  raw_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complementarios_reserva ON public.reserva_complementarios(reserva_id);
CREATE INDEX IF NOT EXISTS idx_complementarios_fecha ON public.reserva_complementarios(fecha) WHERE fecha IS NOT NULL;

ALTER TABLE public.reserva_complementarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lectura autenticados" ON public.reserva_complementarios;
CREATE POLICY "Lectura autenticados" ON public.reserva_complementarios
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.reserva_complementarios IS
  'Líneas individuales de complementarios/consumos/cenas de una reserva. Cada línea con su fecha real (si MrPlan la expone). Usado por la vista produccion_dia para calcular ingresos correctos por día sin depender del informe agregado de MrPlan que tiene el bug de atribución.';

-- ============================================================================
-- Función upsert_complementarios_reserva
-- Reemplaza todas las líneas de una reserva con las nuevas (idempotente)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.upsert_complementarios_reserva(
  p_reserva_id uuid,
  p_lineas jsonb
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_count integer := 0;
  v_linea jsonb;
BEGIN
  DELETE FROM public.reserva_complementarios WHERE reserva_id = p_reserva_id;
  IF jsonb_typeof(p_lineas) <> 'array' THEN RETURN 0; END IF;
  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    INSERT INTO public.reserva_complementarios (reserva_id, concepto, cantidad, fecha, importe, raw_text)
    VALUES (
      p_reserva_id,
      COALESCE(v_linea->>'concepto', 'Sin concepto'),
      COALESCE((v_linea->>'cantidad')::integer, 1),
      NULLIF(v_linea->>'fecha', '')::date,
      COALESCE((v_linea->>'importe')::numeric, 0),
      v_linea->>'raw_text'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- Vista produccion_dia ACTUALIZADA
-- Usa fecha real de las líneas de complementarios cuando existe
-- Fallback: reparto lineal entre las noches de la estancia
-- ============================================================================
CREATE OR REPLACE VIEW public.produccion_dia AS
WITH noches_expandidas AS (
  SELECT
    r.id,
    r.habitacion,
    r.canal,
    r.estado_reserva,
    r.noches,
    r.importe_alojamiento,
    generate_series(r.fecha_in, r.fecha_out - INTERVAL '1 day', INTERVAL '1 day')::date AS dia
  FROM public.reservas r
  WHERE r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
    AND r.noches > 0
    AND r.fecha_out > r.fecha_in
),
-- Complementarios CON fecha explícita → van al día real
compl_con_fecha AS (
  SELECT c.fecha AS dia, SUM(c.importe) AS importe
  FROM public.reserva_complementarios c
  JOIN public.reservas r ON r.id = c.reserva_id
  WHERE c.fecha IS NOT NULL
    AND r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
  GROUP BY c.fecha
),
-- Complementarios SIN fecha → repartir entre noches de estancia
compl_sin_fecha AS (
  SELECT
    r.id AS reserva_id,
    r.noches,
    generate_series(r.fecha_in, r.fecha_out - INTERVAL '1 day', INTERVAL '1 day')::date AS dia,
    (SUM(c.importe) FILTER (WHERE c.fecha IS NULL)) / NULLIF(r.noches, 0) AS importe_por_noche
  FROM public.reservas r
  LEFT JOIN public.reserva_complementarios c ON c.reserva_id = r.id
  WHERE r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
    AND r.noches > 0
    AND r.fecha_out > r.fecha_in
  GROUP BY r.id, r.noches, r.fecha_in, r.fecha_out
  HAVING SUM(c.importe) FILTER (WHERE c.fecha IS NULL) > 0
),
-- Reservas SIN líneas de complementarios → usar el importe_complementarios total
compl_fallback AS (
  SELECT
    r.id AS reserva_id,
    r.noches,
    generate_series(r.fecha_in, r.fecha_out - INTERVAL '1 day', INTERVAL '1 day')::date AS dia,
    r.importe_complementarios / NULLIF(r.noches, 0) AS importe_por_noche
  FROM public.reservas r
  WHERE r.estado_reserva NOT IN ('cancelada', 'no_show')
    AND r.habitacion IN ('cala','nube','margarita','lino','limonero','lavanda')
    AND r.noches > 0
    AND r.fecha_out > r.fecha_in
    AND COALESCE(r.importe_complementarios, 0) > 0
    AND NOT EXISTS (SELECT 1 FROM public.reserva_complementarios c WHERE c.reserva_id = r.id)
),
compl_dia AS (
  SELECT dia, importe FROM compl_con_fecha
  UNION ALL
  SELECT dia, importe_por_noche AS importe FROM compl_sin_fecha
  UNION ALL
  SELECT dia, importe_por_noche AS importe FROM compl_fallback
)
SELECT
  n.dia,
  COUNT(*)::int AS habitaciones_ocupadas,
  ROUND(SUM(COALESCE(n.importe_alojamiento, 0) / NULLIF(n.noches, 0))::numeric, 2) AS ingresos_alojamiento,
  ROUND(COALESCE((SELECT SUM(importe) FROM compl_dia c WHERE c.dia = n.dia), 0)::numeric, 2) AS ingresos_complementarios,
  ROUND((
    SUM(COALESCE(n.importe_alojamiento, 0) / NULLIF(n.noches, 0)) +
    COALESCE((SELECT SUM(importe) FROM compl_dia c WHERE c.dia = n.dia), 0)
  )::numeric, 2) AS ingresos_total,
  jsonb_object_agg(n.habitacion, 1) AS habitaciones,
  jsonb_object_agg(n.canal, 1) AS canales
FROM noches_expandidas n
GROUP BY n.dia
ORDER BY n.dia;

COMMENT ON VIEW public.produccion_dia IS
  'Producción diaria real: reparte alojamiento linealmente entre noches; para complementarios usa la fecha real de cada línea si MrPlan la expone, y si no, fallback lineal. Corrige el bug del informe agregado de MrPlan.';

-- ============================================================================
-- Vista alertas_complementarios_fuera_estancia
-- Detecta el bug de MrPlan: líneas con fecha fuera del rango [fecha_in, fecha_out)
-- ============================================================================
CREATE OR REPLACE VIEW public.alertas_complementarios_fuera_estancia AS
SELECT
  c.id AS complementario_id,
  c.reserva_id,
  r.localizador_externo,
  r.habitacion,
  c.concepto,
  c.cantidad,
  c.fecha AS fecha_complementario,
  r.fecha_in,
  r.fecha_out,
  c.importe,
  CASE
    WHEN c.fecha < r.fecha_in THEN 'antes de check-in'
    WHEN c.fecha >= r.fecha_out THEN 'después de check-out'
  END AS tipo_discrepancia
FROM public.reserva_complementarios c
JOIN public.reservas r ON r.id = c.reserva_id
WHERE c.fecha IS NOT NULL
  AND (c.fecha < r.fecha_in OR c.fecha >= r.fecha_out)
ORDER BY r.fecha_in DESC;

COMMENT ON VIEW public.alertas_complementarios_fuera_estancia IS
  'Complementarios cuya fecha REAL (según MrPlan) cae fuera del rango de estancia del huésped. Evidencia del bug de MrPlan denunciado desde jun 2026.';
