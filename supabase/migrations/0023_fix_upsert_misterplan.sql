-- Migration 0023 · FIX crítico upsert_reserva_misterplan
-- La versión de 0020 usaba 'localizador_externo' que NO existe en la tabla reservas
-- (la columna real es 'id_externo_misterplan')
-- Esto hacía que el desglose alojamiento/complementarios no se persistiera bien
-- ============================================================================

DROP FUNCTION IF EXISTS public.upsert_reserva_misterplan(jsonb);

CREATE OR REPLACE FUNCTION public.upsert_reserva_misterplan(payload jsonb)
RETURNS TABLE(reserva_id uuid, accion text)
LANGUAGE plpgsql AS $func$
DECLARE
  v_id_reserva text;
  v_huesped_id uuid;
  v_reserva_id uuid;
  v_existe boolean;
  v_importe_total numeric(10,2);
  v_importe_aloja numeric(10,2);
  v_importe_compl numeric(10,2);
BEGIN
  v_id_reserva := payload->>'id_reserva';
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

  -- Reserva (usando id_externo_misterplan, la columna REAL)
  SELECT id, true INTO v_reserva_id, v_existe FROM public.reservas
  WHERE id_externo_misterplan = v_id_reserva LIMIT 1;

  IF v_existe THEN
    UPDATE public.reservas SET
      habitacion = payload->>'habitacion',
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
      v_id_reserva, v_huesped_id, payload->>'habitacion',
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
  'v3 · Fix nombre columna id_externo_misterplan + añade anticipo/pendiente_cobro/factura_num/fecha_reserva. Persiste el desglose alojamiento/complementarios que necesita la vista produccion_dia.';
