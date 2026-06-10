-- Migration 0011: sistema de notificaciones in-app
-- Sesión 11 — alerta cuando llega reserva nueva, cobro pendiente, alerta competencia

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('reserva_nueva', 'cobro_pendiente', 'reserva_cancelada', 'alerta_competencia', 'sistema')),
  titulo text not null,
  mensaje text,
  reserva_id uuid references public.reservas(id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  leida boolean not null default false,
  leida_en timestamptz,
  creada_en timestamptz not null default now()
);

create index if not exists idx_notif_creada_en on public.notificaciones (creada_en desc);
create index if not exists idx_notif_leida on public.notificaciones (leida) where leida = false;
create index if not exists idx_notif_reserva on public.notificaciones (reserva_id);

-- RLS: solo usuarios autenticados pueden ver/marcar como leídas (todos comparten visión)
alter table public.notificaciones enable row level security;

drop policy if exists "notif_select_authenticated" on public.notificaciones;
create policy "notif_select_authenticated" on public.notificaciones
  for select to authenticated using (true);

drop policy if exists "notif_update_authenticated" on public.notificaciones;
create policy "notif_update_authenticated" on public.notificaciones
  for update to authenticated using (true) with check (true);

-- Trigger: cuando se inserta una reserva NUEVA con id_externo_misterplan no nulo, crear notificación
create or replace function public.notif_reserva_nueva() returns trigger as $$
declare
  v_nombre text;
begin
  if NEW.id_externo_misterplan is not null then
    select coalesce(nombre, '') || ' ' || coalesce(apellidos, '') into v_nombre
    from public.huespedes where id = NEW.huesped_id;

    insert into public.notificaciones (tipo, titulo, mensaje, reserva_id, metadata)
    values (
      'reserva_nueva',
      'Nueva reserva: ' || coalesce(trim(v_nombre), 'huésped'),
      'Entrada ' || NEW.fecha_in::text || ' · ' || NEW.habitacion || ' · ' || NEW.importe_total::text || '€',
      NEW.id,
      jsonb_build_object('canal', NEW.canal, 'fecha_in', NEW.fecha_in, 'importe', NEW.importe_total)
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notif_reserva_nueva on public.reservas;
create trigger trg_notif_reserva_nueva
  after insert on public.reservas
  for each row execute function public.notif_reserva_nueva();

comment on table public.notificaciones is 'Sistema de notificaciones in-app (badge navbar + página /notificaciones)';
