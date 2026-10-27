-- Migration 0036 · Huéspedes: dejar de crear duplicados y limpiar los creados
--
-- SÍNTOMA
--   La pantalla Huéspedes decía "Únicos: 1.326" con unas 600 personas reales.
--   La lista estaba llena de repeticiones con 0 reservas (el mismo nombre
--   decenas de veces).
--
-- CAUSA
--   upsert_reserva_misterplan empezaba siempre por
--       INSERT INTO huespedes ... ON CONFLICT (email) WHERE email IS NOT NULL
--   Con email NULL nunca hay conflicto, así que el INSERT entraba y creaba un
--   huésped nuevo EN CADA SINCRONIZACIÓN. La búsqueda por nombre que debía
--   evitarlo estaba en un IF que ya nunca se cumplía (el id venía relleno del
--   INSERT). La reserva seguía apuntando al huésped original, de modo que cada
--   copia nueva quedaba huérfana.
--
-- ARREGLO
--   1) Si la reserva ya existe y tiene huésped, se usa ese y no se crea nada.
--   2) Si es nueva: con email, upsert por email; sin email, se busca por
--      nombre y apellidos y solo se crea si no existe.
--   3) Se borran los huéspedes huérfanos: sin ninguna reserva, sin
--      aceptaciones, sin tareas, sin partes de policía y sin notas. Antes se
--      comprueba que ninguna otra tabla apunte a huespedes; si alguna lo hace,
--      se aborta todo sin tocar nada.

BEGIN;

-- 1) y 2) Función de guardado ---------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_reserva_misterplan(payload jsonb)
RETURNS TABLE(reserva_id uuid, accion text)
LANGUAGE plpgsql AS $func$
DECLARE
  v_id_reserva text;
  v_habitacion text;
  v_email text;
  v_nombre text;
  v_apellidos text;
  v_huesped_id uuid;
  v_reserva_id uuid;
  v_huesped_actual uuid;
  v_existe boolean := false;
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
  v_email     := NULLIF(trim(payload->>'huesped_email'), '');
  v_nombre    := COALESCE(NULLIF(trim(payload->>'huesped_nombre'), ''), 'Sin nombre');
  v_apellidos := NULLIF(trim(payload->>'huesped_apellidos'), '');

  -- ¿Existe ya la reserva? (clave compuesta: id externo + habitación)
  SELECT id, huesped_id INTO v_reserva_id, v_huesped_actual
  FROM public.reservas
  WHERE id_externo_misterplan = v_id_reserva AND habitacion = v_habitacion
  LIMIT 1;
  v_existe := FOUND;

  -- Huésped
  IF v_existe AND v_huesped_actual IS NOT NULL THEN
    -- Ya tiene huésped: no se crea otro.
    v_huesped_id := v_huesped_actual;
  ELSIF v_email IS NOT NULL THEN
    INSERT INTO public.huespedes (nombre, apellidos, email, telefono, fuente)
    VALUES (v_nombre, v_apellidos, v_email, payload->>'huesped_telefono', COALESCE(payload->>'canal', 'otro'))
    ON CONFLICT (email) WHERE email IS NOT NULL
    DO UPDATE SET nombre = EXCLUDED.nombre, apellidos = EXCLUDED.apellidos, telefono = EXCLUDED.telefono
    RETURNING id INTO v_huesped_id;
  ELSE
    SELECT id INTO v_huesped_id FROM public.huespedes
    WHERE email IS NULL
      AND nombre = v_nombre
      AND COALESCE(apellidos, '') = COALESCE(v_apellidos, '')
    ORDER BY creado_en
    LIMIT 1;
    IF v_huesped_id IS NULL THEN
      INSERT INTO public.huespedes (nombre, apellidos, telefono, fuente)
      VALUES (v_nombre, v_apellidos, payload->>'huesped_telefono', COALESCE(payload->>'canal', 'otro'))
      RETURNING id INTO v_huesped_id;
    END IF;
  END IF;

  IF v_existe THEN
    UPDATE public.reservas SET
      huesped_id = COALESCE(huesped_id, v_huesped_id),
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
  'v6 · Clave (id_externo_misterplan, habitacion). No crea huéspedes duplicados (0036). Actualiza fecha_reserva si llega una real (0034).';

-- 3) Limpieza de huérfanos -------------------------------------------------
-- 3a) Seguridad: ¿alguna tabla, aparte de las conocidas, apunta a huespedes?
DO $$
DECLARE
  otras text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO otras
  FROM pg_constraint k
  JOIN pg_class c ON c.oid = k.conrelid
  WHERE k.contype = 'f'
    AND k.confrelid = 'public.huespedes'::regclass
    AND c.relname NOT IN ('reservas', 'aceptaciones_condiciones', 'tareas', 'partes_policia');
  IF otras IS NOT NULL THEN
    RAISE EXCEPTION 'Abortado: otras tablas apuntan a huespedes (%). Revisar antes de limpiar.', otras;
  END IF;
END $$;

-- 3b) La reserva de autodiagnóstico de migrations-status (año 2000, cancelada)
DELETE FROM public.reservas WHERE id_externo_misterplan = 'diag-selftest';

-- 3c) Huéspedes sin ningún vínculo
CREATE TEMP TABLE _huerfanos AS
SELECT h.id
FROM public.huespedes h
WHERE NOT EXISTS (SELECT 1 FROM public.reservas r WHERE r.huesped_id = h.id)
  AND NOT EXISTS (SELECT 1 FROM public.aceptaciones_condiciones a WHERE a.huesped_id = h.id)
  AND NOT EXISTS (SELECT 1 FROM public.tareas t WHERE t.huesped_id = h.id)
  AND NOT EXISTS (SELECT 1 FROM public.partes_policia p WHERE p.huesped_id = h.id)
  AND COALESCE(trim(h.notas), '') = '';

DELETE FROM public.huespedes WHERE id IN (SELECT id FROM _huerfanos);

COMMIT;

-- Resultado
SELECT
  (SELECT count(*) FROM _huerfanos)        AS huerfanos_borrados,
  (SELECT count(*) FROM public.huespedes)  AS huespedes_que_quedan,
  (SELECT count(DISTINCT huesped_id) FROM public.reservas
    WHERE estado_reserva NOT IN ('cancelada','no_show')) AS huespedes_con_estancias;
