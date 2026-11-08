-- Migration 0038 · DNI y pasaporte fuera del nombre del huésped
--
-- SÍNTOMA (08/11/2026)
--   MisterPlan pone "NOMBRE APELLIDOS DOCUMENTO" en el campo Nombre y el robot
--   lo partía por el primer espacio: 522 de 635 huéspedes tenían el DNI o el
--   pasaporte dentro de `apellidos` (se veía en Huéspedes, Reservas y las
--   exportaciones) y `dni`/`pasaporte` vacíos, así que los partes de policía
--   salían todos incompletos.
--
-- FIX
--   1. El robot separa el trozo con cifras y lo manda en huesped_documento
--      (commit del robot del 08/11). La función lo guarda en `dni` (formato
--      DNI/NIE), en `pasaporte` (letras y cifras) o en `documento` (solo
--      cifras: puede ser un teléfono), sin pisar uno ya guardado.
--   2. Limpieza única de las fichas actuales: el primer trozo con cifras va a
--      `dni` o `pasaporte` y se quitan de `apellidos` los trozos con cifras y
--      los guiones sueltos. Un nombre no lleva cifras (comprobado: ningún
--      trozo con cifras aparece en `nombre`).

-- 1. Guardar el documento en su columna
CREATE OR REPLACE FUNCTION public.upsert_reserva_misterplan(payload jsonb)
RETURNS TABLE(reserva_id uuid, accion text)
LANGUAGE plpgsql AS $func$
DECLARE
  v_id_reserva text;
  v_habitacion text;
  v_email text;
  v_nombre text;
  v_apellidos text;
  v_documento text;
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
  v_documento := NULLIF(upper(trim(payload->>'huesped_documento')), '');

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

  -- Documento (DNI/NIE o pasaporte) a su columna, sin pisar uno ya guardado.
  -- Lo usan los partes de policía; antes iba pegado a los apellidos.
  -- DNI/NIE → dni; letras y cifras → pasaporte; solo cifras (puede ser un
  -- teléfono o un documento extranjero) → documento, sin etiquetarlo.
  IF v_documento IS NOT NULL AND v_huesped_id IS NOT NULL THEN
    IF v_documento ~ '^[XYZ]?[0-9]{7,8}[A-Z]$' THEN
      UPDATE public.huespedes SET dni = COALESCE(dni, v_documento) WHERE id = v_huesped_id;
    ELSIF v_documento ~ '[A-Z]' THEN
      UPDATE public.huespedes SET pasaporte = COALESCE(pasaporte, v_documento) WHERE id = v_huesped_id;
    ELSE
      UPDATE public.huespedes SET documento = COALESCE(documento, v_documento) WHERE id = v_huesped_id;
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

-- 2. Limpieza única de las fichas actuales
WITH h AS (
  SELECT id, upper(substring(apellidos from '(\S*[0-9]\S*)')) AS doc,
         NULLIF(trim(regexp_replace(regexp_replace(regexp_replace(apellidos, '\S*[0-9]\S*', ' ', 'g'), '(^|\s)[-.,/]+(?=\s|$)', ' ', 'g'), '\s+', ' ', 'g')), '') AS limpio
  FROM public.huespedes
  WHERE apellidos ~ '[0-9]' OR apellidos ~ '(^|\s)[-.,/]+(\s|$)'
)
UPDATE public.huespedes x SET
  dni       = CASE WHEN h.doc ~ '^[XYZ]?[0-9]{7,8}[A-Z]$' THEN COALESCE(x.dni, h.doc) ELSE x.dni END,
  pasaporte = CASE WHEN h.doc !~ '^[XYZ]?[0-9]{7,8}[A-Z]$' AND h.doc ~ '[A-Z]' THEN COALESCE(x.pasaporte, h.doc) ELSE x.pasaporte END,
  documento = CASE WHEN h.doc ~ '^[0-9]+$' THEN COALESCE(x.documento, h.doc) ELSE x.documento END,
  apellidos = h.limpio
FROM h WHERE x.id = h.id;

-- Verificación: 0 apellidos con cifras
SELECT count(*) FILTER (WHERE apellidos ~ '[0-9]') AS apellidos_con_cifras,
       count(dni) AS con_dni, count(pasaporte) AS con_pasaporte, count(documento) AS con_documento, count(*) AS total
FROM public.huespedes;
