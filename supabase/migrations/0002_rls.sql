-- ============================================================================
-- Migration 0002 — Row Level Security (RLS)
-- ============================================================================
-- Política: cualquier usuario autenticado puede leer y escribir todo lo
-- de Casa Mendilore. Es un panel interno con 2-3 usuarios.
-- En Fase 3 podríamos refinar a roles más finos.
-- ============================================================================

-- Habilitar RLS en todas las tablas
alter table public.perfiles enable row level security;
alter table public.huespedes enable row level security;
alter table public.reservas enable row level security;
alter table public.pagos enable row level security;
alter table public.competidores enable row level security;
alter table public.precios_competidores_dia enable row level security;

-- ============================================================================
-- PERFILES — cada usuario ve y edita su propio perfil; admin ve todos
-- ============================================================================
create policy "perfiles_select_own_or_admin"
  on public.perfiles for select
  using (
    auth.uid() = id
    or exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'admin')
  );

create policy "perfiles_update_own"
  on public.perfiles for update
  using (auth.uid() = id);

-- ============================================================================
-- HUESPEDES, RESERVAS, PAGOS, COMPETIDORES, PRECIOS — abierto a autenticados
-- ============================================================================
create policy "huespedes_authenticated_all" on public.huespedes for all to authenticated using (true) with check (true);
create policy "reservas_authenticated_all" on public.reservas for all to authenticated using (true) with check (true);
create policy "pagos_authenticated_all" on public.pagos for all to authenticated using (true) with check (true);
create policy "competidores_authenticated_all" on public.competidores for all to authenticated using (true) with check (true);
create policy "precios_authenticated_select" on public.precios_competidores_dia for select to authenticated using (true);

-- Insert/Update/Delete de precios_competidores_dia SOLO via service_role
-- (el webhook /api/webhook/apify usa service_role)
-- No creamos política para authenticated → solo service_role bypasses RLS
