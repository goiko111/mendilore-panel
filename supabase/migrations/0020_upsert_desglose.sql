-- Migration 0020: upsert_reserva_misterplan ahora lee importe_alojamiento + importe_complementarios
-- Fase 2.6 — desglose pedido por Juan (Bloque 2.6)
-- Reemplaza la función previa. Si payload no trae estos campos, fallback a importe_total para alojamiento.

CREATE OR REPLACE FUNCTION public.upsert_reserva_misterplan(payload jsonb)
RETURNS TABLE(reserva_id uuid, accion text)
LANGUAGE plpgsql AS $$
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

  -- Huesped por email cuando exista, si no por nombre+apellidos
  INSERT INTO public.huespedes (nombre, apellidos, email, telefono, fuente)
  VALUES (
    COALESCE(payload->>'huesped_nombre', 'Sin nombre'),
    payload->>'huesped_apellidos',
    payload->>'huesped_email',
    payload->>'huesped_telefono',
    COALESCE(payload->>'canal', 'otro')
  )
  ON CONFLICT (email) WHERE email IS NOT NULL
  DO UPDATE SET
    nombre = EXCLUDED.nombre,
    apellidos = EXCLUDED.apellidos,
    telefono = EXCLUDED.telefono
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
      )
      RETURNING id INTO v_huesped_id;
    END IF;
  END IF;

  -- Reserva
  SELECT id, true INTO v_reserva_id, v_existe FROM public.reservas
  WHERE localizador_externo = v_id_reserva LIMIT 1;

  IF v_existe THEN
    UPDATE public.reservas SET
      habitacion = payload->>'habitacion',
      fecha_in = (payload->>'fecha_in')::date,
      fecha_out = (payload->>'fecha_out')::date,
      noches = (payload->>'noches')::integer,
      importe_total = v_importe_total,
      importe_alojamiento = v_importe_aloja,
      importe_complementarios = v_importe_compl,
      importe_moneda = COALESCE(payload->>'importe_moneda', 'EUR'),
      estado_reserva = payload->>'estado_reserva',
      estado_cobro = payload->>'estado_cobro',
      canal = payload->>'canal',
      forma_pago = payload->>'forma_pago',
      numero_huespedes = NULLIF((payload->>'num_huespedes'), '')::integer,
      updated_at = now()
    WHERE id = v_reserva_id;
    RETURN QUERY SELECT v_reserva_id, 'update'::text;
  ELSE
    INSERT INTO public.reservas (
      localizador_externo, huesped_id, habitacion, fecha_in, fecha_out, noches,
      importe_total, importe_alojamiento, importe_complementarios, importe_moneda,
      estado_reserva, estado_cobro, canal, forma_pago, numero_huespedes
    ) VALUES (
      v_id_reserva, v_huesped_id, payload->>'habitacion',
      (payload->>'fecha_in')::date, (payload->>'fecha_out')::date,
      (payload->>'noches')::integer,
      v_importe_total, v_importe_aloja, v_importe_compl,
      COALESCE(payload->>'importe_moneda', 'EUR'),
      payload->>'estado_reserva', payload->>'estado_cobro',
      payload->>'canal', payload->>'forma_pago',
      NULLIF((payload->>'num_huespedes'), '')::integer
    ) RETURNING id INTO v_reserva_id;
    RETURN QUERY SELECT v_reserva_id, 'insert'::text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.upsert_reserva_misterplan IS
  'Upsert atómico de reserva desde el scraper MisterPlan. Lee importe_alojamiento + importe_complementarios desde el payload (con fallback a importe_total para alojamiento).';
