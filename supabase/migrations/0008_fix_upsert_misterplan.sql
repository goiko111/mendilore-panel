-- ============================================================================
-- Migration 0008 — Fix migration 0007 upsert_reserva_misterplan
-- ============================================================================
-- BUG 1: huespedes table doesn't have `documento` column (schema 0001 nunca lo añadió)
-- BUG 2: huespedes uses `actualizado_en`, not `updated_at`
-- BUG 3: añadir update_actualizado_en automático
-- ============================================================================

-- Añadir columna documento (idempotente)
alter table public.huespedes add column if not exists documento text;
create index if not exists idx_huespedes_documento on public.huespedes(documento);

-- Reescribir función upsert con nombre de columna correcto
create or replace function public.upsert_reserva_misterplan(payload jsonb)
returns table (reserva_id uuid, huesped_id uuid, accion text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_huesped_id uuid;
  v_reserva_id uuid;
  v_accion text;
  v_email text;
  v_nombre text;
  v_apellidos text;
  v_telefono text;
  v_pais text;
  v_documento text;
  v_id_externo text;
begin
  v_id_externo := payload->>'id_reserva';
  if v_id_externo is null or v_id_externo = '' then
    raise exception 'id_reserva is required';
  end if;

  v_email := nullif(payload->>'huesped_email', '');
  v_nombre := coalesce(payload->>'huesped_nombre', '');
  v_apellidos := nullif(payload->>'huesped_apellidos', '');
  v_telefono := nullif(payload->>'huesped_telefono', '');
  v_pais := nullif(payload->>'huesped_pais', '');
  v_documento := nullif(payload->>'huesped_documento', '');

  -- Upsert huésped
  if v_email is not null then
    select id into v_huesped_id from public.huespedes where lower(email) = lower(v_email) limit 1;
  end if;

  if v_huesped_id is null and v_telefono is not null then
    select id into v_huesped_id from public.huespedes
      where telefono = v_telefono and lower(nombre) = lower(v_nombre)
      limit 1;
  end if;

  if v_huesped_id is null then
    insert into public.huespedes (nombre, apellidos, email, telefono, pais, documento, fuente, notas)
    values (v_nombre, v_apellidos, v_email, v_telefono, v_pais, v_documento, payload->>'canal', '[MisterPlan]')
    returning id into v_huesped_id;
  else
    update public.huespedes set
      apellidos = coalesce(v_apellidos, apellidos),
      telefono = coalesce(v_telefono, telefono),
      pais = coalesce(v_pais, pais),
      documento = coalesce(v_documento, documento),
      actualizado_en = now()
    where id = v_huesped_id;
  end if;

  -- Upsert reserva por id_externo_misterplan
  select id into v_reserva_id from public.reservas
    where id_externo_misterplan = v_id_externo
    limit 1;

  if v_reserva_id is null then
    insert into public.reservas (
      id_externo_misterplan, huesped_id, canal, habitacion,
      fecha_in, fecha_out, noches,
      importe_total, importe_moneda, anticipo, pendiente_cobro,
      estado_reserva, estado_cobro, forma_pago, factura_num,
      fecha_reserva, observaciones, num_huespedes
    ) values (
      v_id_externo, v_huesped_id, payload->>'canal', payload->>'habitacion',
      (payload->>'fecha_in')::date, (payload->>'fecha_out')::date, (payload->>'noches')::int,
      (payload->>'importe_total')::numeric, payload->>'importe_moneda',
      coalesce((payload->>'anticipo')::numeric, 0),
      coalesce((payload->>'pendiente_cobro')::numeric, 0),
      payload->>'estado_reserva', payload->>'estado_cobro',
      payload->>'forma_pago', payload->>'factura_num',
      (payload->>'fecha_reserva')::timestamptz,
      payload->>'observaciones',
      nullif(payload->>'num_huespedes', '')::int
    )
    returning id into v_reserva_id;
    v_accion := 'insert';
  else
    update public.reservas set
      huesped_id = v_huesped_id,
      canal = payload->>'canal',
      habitacion = payload->>'habitacion',
      fecha_in = (payload->>'fecha_in')::date,
      fecha_out = (payload->>'fecha_out')::date,
      noches = (payload->>'noches')::int,
      importe_total = (payload->>'importe_total')::numeric,
      importe_moneda = payload->>'importe_moneda',
      anticipo = coalesce((payload->>'anticipo')::numeric, 0),
      pendiente_cobro = coalesce((payload->>'pendiente_cobro')::numeric, 0),
      estado_reserva = payload->>'estado_reserva',
      estado_cobro = payload->>'estado_cobro',
      forma_pago = payload->>'forma_pago',
      factura_num = payload->>'factura_num',
      fecha_reserva = (payload->>'fecha_reserva')::timestamptz,
      observaciones = payload->>'observaciones',
      num_huespedes = nullif(payload->>'num_huespedes', '')::int,
      actualizado_en = now()
    where id = v_reserva_id;
    v_accion := 'update';
  end if;

  return query select v_reserva_id, v_huesped_id, v_accion;
end;
$$;

grant execute on function public.upsert_reserva_misterplan(jsonb) to service_role;
