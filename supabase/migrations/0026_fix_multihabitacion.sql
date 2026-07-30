-- Migration 0026 · Fix reservas multi-habitación (bug check-ins Marcelo/Alba, 22 jul)
-- CAUSA: el upsert buscaba por id_externo_misterplan SIN considerar habitación.
-- Una reserva de MrPlan con 3 habitaciones comparte el MISMO id → las 3 filas
-- colapsaban en 1 (cada scrape sobrescribía la habitación).
-- FIX: clave compuesta (id_externo_misterplan, habitacion).

DROP FUNCTION IF EXISTS public.upsert_reserva_misterplan(jsonb);

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
  'v4 · Clave compuesta (id_externo_misterplan, habitacion) — reservas multi-habitación crean 1 fila por habitación. Fix bug check-ins Marcelo/Alba.';

-- Verificación: reservas de hoy y mañana con todas sus habitaciones
SELECT id_externo_misterplan, habitacion, fecha_in, estado_reserva
FROM public.reservas
WHERE fecha_in BETWEEN CURRENT_DATE AND CURRENT_DATE + 1
ORDER BY fecha_in, id_externo_misterplan, habitacion;
