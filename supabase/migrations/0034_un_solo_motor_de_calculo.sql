-- Migration 0034 · Un solo motor de cálculo para todo el panel
--
-- PROBLEMA
--   El panel tenía dos cálculos distintos de lo mismo:
--     · produccion_dia (vista, 0033)  → Comparativa YoY
--     · metricas_dia   (vista MATERIALIZADA, 0025) → Resumen, Métricas, PDF de KPIs
--   Fórmulas diferentes (metricas_dia reparte los consumos a partes iguales
--   entre noches; produccion_dia los pone en el día en que se consumieron) y,
--   además, metricas_dia solo se refrescaba una vez al día por pg_cron. Tras
--   cada sincronización las pantallas no coincidían durante horas, y nunca
--   coincidían del todo. Juan ya lo detectó una vez con el ADR (243,56 € en una
--   pantalla y 240 € en otra para los mismos 7 días).
--
-- ARREGLO
--   metricas_dia pasa a ser una vista NORMAL construida sobre produccion_dia:
--   misma fuente, siempre al día, sin refresco programado. Mantiene sus
--   columnas para no romper ninguna pantalla y añade el desglose
--   ingresos_alojamiento / ingresos_complementarios, que hace falta para que
--   el ADR sea solo de alojamiento en todas partes.

-- Todo en una transacción: si algo falla, no queda nada a medias.
BEGIN;

-- 1) Quitar el refresco programado de la vista materializada
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-metricas-dia');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- no existía o pg_cron no está: no pasa nada
END $$;

-- 2) Sustituir la vista materializada por una vista normal
DROP MATERIALIZED VIEW IF EXISTS public.metricas_dia;
DROP VIEW IF EXISTS public.metricas_dia;

CREATE VIEW public.metricas_dia AS
WITH calendario AS (
  SELECT d::date AS fecha
  FROM generate_series(current_date - interval '800 days',
                       current_date + interval '400 days',
                       interval '1 day') d
)
SELECT
  c.fecha,
  6                                                         AS habitaciones_totales,
  COALESCE(p.habitaciones_ocupadas, 0)                      AS habitaciones_ocupadas,
  ROUND(LEAST(100.0, 100.0 * COALESCE(p.habitaciones_ocupadas, 0) / 6), 2)
                                                            AS occupancy_pct,
  COALESCE(p.ingresos_total, 0)                             AS ingresos_dia,
  COALESCE(p.ingresos_alojamiento, 0)                       AS ingresos_alojamiento,
  COALESCE(p.ingresos_complementarios, 0)                   AS ingresos_complementarios,
  -- ADR y RevPAR solo sobre alojamiento (criterio acordado con Juan)
  ROUND(CASE WHEN COALESCE(p.habitaciones_ocupadas, 0) > 0
             THEN p.ingresos_alojamiento / p.habitaciones_ocupadas
             ELSE 0 END, 2)                                 AS adr,
  ROUND(COALESCE(p.ingresos_alojamiento, 0) / 6, 2)         AS revpar
FROM calendario c
LEFT JOIN public.produccion_dia p ON p.dia = c.fecha;

COMMENT ON VIEW public.metricas_dia IS
  'Una fila por día (hace 800 días → dentro de 400). Construida sobre produccion_dia: misma fuente que la Comparativa YoY. Vista normal, siempre al día.';

GRANT SELECT ON public.metricas_dia TO authenticated, service_role;

-- 3) upsert_reserva_misterplan: actualizar también la fecha de reserva
--    (copia literal de la 0026 con un único cambio, marcado como NUEVO)
CREATE OR REPLACE FUNCTION public.upsert_reserva_misterplan(payload jsonb)
RETURNS TABLE(reserva_id uuid, accion text)
LANGUAGE plpgsql AS $func$
DECLARE
  v_id_reserva text;
  v_habitacion text;
  v_huesped_id uuid;
  v_reserva_id uuid;
  v_existe boolean;
  v_importe_total numeric(10,2);
  v_importe_aloja numeric(10,2);
  v_importe_compl numeric(10,2);
BEGIN
  v_id_reserva := payload->>'id_reserva';
  v_habitacion := payload->>'habitacion';
  IF v_id_reserva IS NULL THEN
    RAISE EXCEPTION 'id_reserva missing in payload';
  END IF;

  v_importe_total := COALESCE((payload->>'importe_total')::numeric, 0);
  v_importe_aloja := COALESCE((payload->>'importe_alojamiento')::numeric, v_importe_total);
  v_importe_compl := COALESCE((payload->>'importe_complementarios')::numeric, 0);

  -- Huésped
  INSERT INTO public.huespedes (nombre, apellidos, email, telefono, fuente)
  VALUES (
    COALESCE(payload->>'huesped_nombre', 'Sin nombre'),
    payload->>'huesped_apellidos',
    payload->>'huesped_email',
    payload->>'huesped_telefono',
    COALESCE(payload->>'canal', 'otro')
  )
  ON CONFLICT (email) WHERE email IS NOT NULL
  DO UPDATE SET nombre = EXCLUDED.nombre, apellidos = EXCLUDED.apellidos, telefono = EXCLUDED.telefono
  RETURNING id INTO v_huesped_id;

  IF v_huesped_id IS NULL THEN
    SELECT id INTO v_huesped_id FROM public.huespedes
    WHERE nombre = COALESCE(payload->>'huesped_nombre', 'Sin nombre')
      AND COALESCE(apellidos, '') = COALESCE(payload->>'huesped_apellidos', '')
    LIMIT 1;
    IF v_huesped_id IS NULL THEN
      INSERT INTO public.huespedes (nombre, apellidos, telefono, fuente)
      VALUES (
        COALESCE(payload->>'huesped_nombre', 'Sin nombre'),
        payload->>'huesped_apellidos',
        payload->>'huesped_telefono',
        COALESCE(payload->>'canal', 'otro')
      ) RETURNING id INTO v_huesped_id;
    END IF;
  END IF;

  -- CLAVE COMPUESTA: id externo + habitación (reservas multi-habitación = 1 fila por habitación)
  SELECT id, true INTO v_reserva_id, v_existe FROM public.reservas
  WHERE id_externo_misterplan = v_id_reserva
    AND habitacion = v_habitacion
  LIMIT 1;

  IF v_existe THEN
    UPDATE public.reservas SET
      fecha_in = (payload->>'fecha_in')::date,
      fecha_out = (payload->>'fecha_out')::date,
      importe_total = v_importe_total,
      importe_alojamiento = v_importe_aloja,
      importe_complementarios = v_importe_compl,
      importe_moneda = COALESCE(payload->>'importe_moneda', 'EUR'),
      estado_reserva = payload->>'estado_reserva',
      estado_cobro = payload->>'estado_cobro',
      canal = payload->>'canal',
      forma_pago = payload->>'forma_pago',
      num_huespedes = NULLIF((payload->>'num_huespedes'), '')::integer,
      anticipo = COALESCE((payload->>'anticipo')::numeric, 0),
      pendiente_cobro = COALESCE((payload->>'pendiente_cobro')::numeric, 0),
      factura_num = payload->>'factura_num',
      -- NUEVO (0034): corregir la fecha de reserva si MisterPlan la da y la
      -- guardada era el relleno (= fecha de entrada). Antes solo se fijaba al
      -- insertar, así que un fallo de lectura la dejaba mal para siempre.
      fecha_reserva = CASE
        WHEN (payload->>'fecha_reserva') IS NOT NULL
         AND ((payload->>'fecha_reserva')::timestamptz)::date <> (payload->>'fecha_in')::date
        THEN (payload->>'fecha_reserva')::timestamptz
        ELSE fecha_reserva
      END,
      actualizado_en = now()
    WHERE id = v_reserva_id;
    RETURN QUERY SELECT v_reserva_id, 'update'::text;
  ELSE
    INSERT INTO public.reservas (
      id_externo_misterplan, huesped_id, habitacion, fecha_in, fecha_out,
      importe_total, importe_alojamiento, importe_complementarios, importe_moneda,
      estado_reserva, estado_cobro, canal, forma_pago, num_huespedes,
      anticipo, pendiente_cobro, factura_num, fecha_reserva
    ) VALUES (
      v_id_reserva, v_huesped_id, v_habitacion,
      (payload->>'fecha_in')::date, (payload->>'fecha_out')::date,
      v_importe_total, v_importe_aloja, v_importe_compl,
      COALESCE(payload->>'importe_moneda', 'EUR'),
      payload->>'estado_reserva', payload->>'estado_cobro',
      payload->>'canal', payload->>'forma_pago',
      NULLIF((payload->>'num_huespedes'), '')::integer,
      COALESCE((payload->>'anticipo')::numeric, 0),
      COALESCE((payload->>'pendiente_cobro')::numeric, 0),
      payload->>'factura_num',
      COALESCE((payload->>'fecha_reserva')::timestamptz, now())
    ) RETURNING id INTO v_reserva_id;
    RETURN QUERY SELECT v_reserva_id, 'insert'::text;
  END IF;
END;
$func$;

COMMENT ON FUNCTION public.upsert_reserva_misterplan IS
  'v5 · Clave (id_externo_misterplan, habitacion). Actualiza fecha_reserva si llega una real (0034).';

COMMIT;

-- 4) Comprobación: octubre 2026, las dos fuentes deben dar lo mismo
SELECT 'metricas_dia'  AS fuente,
       SUM(habitaciones_ocupadas)          AS noches,
       ROUND(SUM(ingresos_alojamiento), 2) AS alojamiento,
       ROUND(SUM(ingresos_complementarios), 2) AS consumos
FROM public.metricas_dia
WHERE fecha BETWEEN '2026-10-01' AND '2026-10-31'
UNION ALL
SELECT 'produccion_dia',
       SUM(habitaciones_ocupadas),
       ROUND(SUM(ingresos_alojamiento), 2),
       ROUND(SUM(ingresos_complementarios), 2)
FROM public.produccion_dia
WHERE dia BETWEEN '2026-10-01' AND '2026-10-31';
