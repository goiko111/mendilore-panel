-- ============================================================================
-- Migration 0001 — Casa Mendilore panel · Schema inicial
-- ============================================================================
-- Crea las tablas base del panel interno:
--   - perfiles (extiende auth.users con metadatos)
--   - huespedes (clientes finales de Casa Mendilore)
--   - reservas (reservas individuales)
--   - pagos (movimientos económicos por reserva)
--   - competidores (los 6 hoteles que monitorizamos en Booking)
--   - precios_competidores_dia (snapshot diario/semanal de precios scrapeados)
--   - metricas_dia (vista materializada con KPIs: occupancy, ADR, RevPAR)
--
-- Decisiones que respeta:
--   D-108 Supabase project mendilore-panel
--   D-116 Scraping Booking propio para competencia
--   D-118 Actor voyager/booking-scraper validado
-- ============================================================================

-- ============================================================================
-- 1. PERFILES — extiende auth.users con rol y metadatos
-- ============================================================================
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  rol text not null default 'visualizador' check (rol in ('admin', 'editor', 'visualizador')),
  organizacion text not null default 'Casa Mendilore',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.perfiles is 'Metadatos por usuario. rol admin = GUGO; editor = Juan/Anabel; visualizador = invitados';

-- Trigger que crea el perfil automáticamente al registrar un usuario en auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)),
    case
      when new.email like '%@gugocreative.com' then 'admin'
      when new.email = 'info@mendilore.com' then 'editor'
      else 'visualizador'
    end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- 2. HUESPEDES — clientes finales que se hospedan
-- ============================================================================
create table if not exists public.huespedes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellidos text,
  email text,
  telefono text,
  pais text,
  fecha_alta date not null default current_date,
  fuente text check (fuente in ('directo', 'booking', 'airbnb', 'expedia', 'web_propia', 'walk_in', 'otro')),
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_huespedes_email on public.huespedes(email);
create index if not exists idx_huespedes_telefono on public.huespedes(telefono);
create index if not exists idx_huespedes_fecha_alta on public.huespedes(fecha_alta);

-- ============================================================================
-- 3. RESERVAS — reservas individuales
-- ============================================================================
create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  huesped_id uuid references public.huespedes(id) on delete set null,
  habitacion text not null check (habitacion in ('cala', 'nube', 'margarita', 'lino', 'limonero', 'lavanda')),
  fecha_in date not null,
  fecha_out date not null check (fecha_out > fecha_in),
  noches int generated always as ((fecha_out - fecha_in)) stored,
  importe_total numeric(10, 2) not null default 0,
  importe_moneda text not null default 'EUR' check (length(importe_moneda) = 3),
  estado_reserva text not null default 'confirmada' check (estado_reserva in ('pendiente', 'confirmada', 'cancelada', 'no_show', 'completada')),
  estado_cobro text not null default 'pendiente' check (estado_cobro in ('pendiente', 'cobrado', 'fallido', 'reembolsado', 'no_aplica')),
  canal text check (canal in ('directo', 'booking', 'airbnb', 'expedia', 'web_propia', 'walk_in', 'otro')),
  mister_plan_id text, -- ID externo de MisterPlan/RuralGest cuando llegue la API
  observaciones text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_reservas_fecha_in on public.reservas(fecha_in);
create index if not exists idx_reservas_estado_cobro on public.reservas(estado_cobro);
create index if not exists idx_reservas_canal on public.reservas(canal);
create index if not exists idx_reservas_mister_plan_id on public.reservas(mister_plan_id);
create index if not exists idx_reservas_huesped_id on public.reservas(huesped_id);

-- ============================================================================
-- 4. PAGOS — movimientos económicos por reserva
-- ============================================================================
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.reservas(id) on delete cascade,
  fecha date not null default current_date,
  monto numeric(10, 2) not null,
  moneda text not null default 'EUR' check (length(moneda) = 3),
  metodo text check (metodo in ('tarjeta', 'transferencia', 'efectivo', 'bizum', 'paypal', 'otro')),
  estado text not null default 'completado' check (estado in ('completado', 'pendiente', 'fallido', 'reembolsado')),
  notas text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_pagos_reserva_id on public.pagos(reserva_id);
create index if not exists idx_pagos_fecha on public.pagos(fecha);

-- ============================================================================
-- 5. COMPETIDORES — los 6 hoteles que monitorizamos en Booking
-- ============================================================================
create table if not exists public.competidores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  booking_slug text unique, -- ej: "casa-rural-higeralde", "jauregui"
  booking_url text not null,
  airbnb_url text,
  web_propia text,
  estrellas int check (estrellas between 0 and 5),
  habitaciones int,
  activo boolean not null default true,
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ============================================================================
-- 6. PRECIOS_COMPETIDORES_DIA — snapshot scrapeado de Apify cada run
-- ============================================================================
create table if not exists public.precios_competidores_dia (
  id uuid primary key default gen_random_uuid(),
  competidor_id uuid not null references public.competidores(id) on delete cascade,
  fecha_snapshot date not null default current_date,  -- cuándo lo scrapeamos
  check_in date not null,                              -- fechas para las que se consultó precio
  check_out date not null,
  noches int generated always as ((check_out - check_in)) stored,
  precio_total numeric(10, 2),                          -- null = no disponible / sold out
  precio_por_noche numeric(10, 2) generated always as (
    case when (check_out - check_in) > 0 and precio_total is not null
         then round(precio_total / (check_out - check_in), 2)
         else null end
  ) stored,
  moneda text default 'EUR',
  disponible boolean not null default true,             -- false = sold out
  rating numeric(3, 1),                                  -- ej 8.7
  rating_label text,                                     -- "Fabulous", "Exceptional"
  reviews_count int,
  apify_run_id text,                                     -- run que generó este row, para auditoría
  raw_data jsonb,                                        -- output JSON crudo del actor por si necesitamos parsing futuro
  creado_en timestamptz not null default now(),
  unique (competidor_id, fecha_snapshot, check_in, check_out)
);

create index if not exists idx_precios_comp_competidor_fecha on public.precios_competidores_dia(competidor_id, fecha_snapshot);
create index if not exists idx_precios_comp_checkin on public.precios_competidores_dia(check_in);

-- ============================================================================
-- 7. METRICAS_DIA — vista materializada con KPIs de Casa Mendilore
-- ============================================================================
-- Calcula occupancy, ADR (Average Daily Rate), RevPAR (Revenue Per Available Room)
-- agregando por fecha. 6 habitaciones disponibles.
create materialized view if not exists public.metricas_dia as
with calendario as (
  -- Genera un row por (fecha, habitacion) para los últimos 365 días + 90 días futuros
  select
    d::date as fecha,
    h as habitacion
  from generate_series(current_date - interval '365 days', current_date + interval '90 days', interval '1 day') d
  cross join unnest(array['cala', 'nube', 'margarita', 'lino', 'limonero', 'lavanda']) as h
),
ocupacion as (
  -- Para cada (fecha, habitacion), saber si está ocupada según reservas
  select
    c.fecha,
    c.habitacion,
    case when r.id is not null then 1 else 0 end as ocupada,
    coalesce(r.importe_total / nullif(r.noches, 0), 0) as ingreso_dia
  from calendario c
  left join public.reservas r on
    r.habitacion = c.habitacion
    and r.estado_reserva in ('confirmada', 'completada')
    and c.fecha >= r.fecha_in
    and c.fecha < r.fecha_out
)
select
  fecha,
  count(*) as habitaciones_totales,
  sum(ocupada) as habitaciones_ocupadas,
  round(100.0 * sum(ocupada) / count(*), 2) as occupancy_pct,
  round(sum(ingreso_dia)::numeric, 2) as ingresos_dia,
  -- ADR = ingresos / habitaciones ocupadas
  round((case when sum(ocupada) > 0 then sum(ingreso_dia) / sum(ocupada) else 0 end)::numeric, 2) as adr,
  -- RevPAR = ingresos / habitaciones totales = ADR * occupancy
  round((sum(ingreso_dia) / count(*))::numeric, 2) as revpar
from ocupacion
group by fecha;

create unique index if not exists idx_metricas_dia_fecha on public.metricas_dia(fecha);

-- ============================================================================
-- 8. TRIGGERS de actualizado_en
-- ============================================================================
create or replace function public.touch_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger perfiles_touch before update on public.perfiles for each row execute procedure public.touch_actualizado_en();
create trigger huespedes_touch before update on public.huespedes for each row execute procedure public.touch_actualizado_en();
create trigger reservas_touch before update on public.reservas for each row execute procedure public.touch_actualizado_en();
create trigger competidores_touch before update on public.competidores for each row execute procedure public.touch_actualizado_en();
