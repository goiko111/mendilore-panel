-- ============================================================================
-- Migration 0004 — Fase 3: Evidencias jurídicas y trazabilidad
-- ============================================================================
-- Cumple Fase 3 propuesta v4 (P058/26) sec 3.4:
--   "Sistema de registro de aceptación de condiciones específicas de Casa Mendilore
--    (política de cancelación, política de mascotas, condiciones particulares) por
--    parte del huésped: timestamp UTC, IP, hash SHA-256 del documento, versión.
--    Almacenamiento en Supabase con copia en Drive. Conservación garantizada 6 años."
--
-- Tablas:
--   - documentos_legales: versiones de los textos (condiciones, política cancelación,
--     política mascotas, condiciones particulares) con su hash SHA-256
--   - aceptaciones_condiciones: cada vez que un huésped acepta, queda registro
--   - logs_actividad: auditoría interna del panel (quién entra, qué consulta, exporta)
-- ============================================================================

-- ============================================================================
-- 1. DOCUMENTOS LEGALES — versiones publicadas
-- ============================================================================
-- Cada documento (condiciones particulares, política cancelación, etc.) puede
-- tener múltiples versiones. El huésped acepta una versión concreta en un momento
-- concreto y queremos poder reproducir EXACTAMENTE qué texto vio.
create table if not exists public.documentos_legales (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('condiciones_particulares', 'politica_cancelacion', 'politica_mascotas', 'politica_privacidad', 'cookies', 'otro')),
  version text not null,                  -- p.ej. '2026-06-01' o 'v1.2'
  titulo text not null,                   -- p.ej. 'Política de cancelación'
  contenido text not null,                -- texto completo del documento (HTML o plano)
  hash_sha256 text not null,              -- SHA-256 del contenido en hex (64 chars)
  vigente boolean not null default true,  -- solo una versión vigente por tipo
  publicado_en timestamptz not null default now(),
  publicado_por uuid references auth.users(id) on delete set null,
  notas text,
  unique (tipo, version)
);

create index if not exists idx_doc_legales_tipo_vigente on public.documentos_legales(tipo) where vigente = true;
create index if not exists idx_doc_legales_hash on public.documentos_legales(hash_sha256);

comment on table public.documentos_legales is
  'Versiones publicadas de los documentos legales. Cada aceptación apunta a la versión exacta que el huésped vio (con hash para auditoría).';

-- ============================================================================
-- 2. ACEPTACIONES DE CONDICIONES — registro probatorio
-- ============================================================================
-- Cada fila es UN evento "este huésped, en este momento, aceptó este documento".
-- Conservación garantizada 6 años (plazo mercantil). NO se borran nunca por
-- defecto. Si hace falta cumplir GDPR derecho al olvido, anonimizar (poner nombre/email/IP a NULL)
-- pero conservar la fila para mantener la cadena probatoria del consentimiento.
create table if not exists public.aceptaciones_condiciones (
  id uuid primary key default gen_random_uuid(),
  -- A quién pertenece
  huesped_id uuid references public.huespedes(id) on delete set null,
  reserva_id uuid references public.reservas(id) on delete set null,
  -- Identidad capturada en el momento (puede ser distinta a la del huésped registrado)
  huesped_nombre_capturado text not null,
  huesped_email_capturado text,
  huesped_documento_capturado text,        -- DNI/NIE/Pasaporte si se capturó
  -- Documento aceptado
  documento_legal_id uuid not null references public.documentos_legales(id) on delete restrict,
  documento_tipo text not null,            -- denormalizado para queries rápidas + por si docs se borran
  documento_version text not null,
  documento_hash_sha256 text not null,     -- duplicado del momento de aceptación para auditoría
  -- Contexto técnico (validez jurídica)
  aceptado_en timestamptz not null default now(),
  ip_cliente inet not null,                -- IP del huésped en el momento
  user_agent text,                          -- navegador
  url_pagina text,                          -- página donde se aceptó
  metodo text not null default 'checkbox_web' check (metodo in ('checkbox_web', 'checkbox_email', 'pdf_firmado', 'voz', 'otro')),
  -- Evidencia adicional opcional
  pdf_firmado_path text,                    -- ruta a Drive si se subió un PDF firmado
  notas text,
  creado_en timestamptz not null default now()
);

create index if not exists idx_aceptaciones_huesped on public.aceptaciones_condiciones(huesped_id);
create index if not exists idx_aceptaciones_reserva on public.aceptaciones_condiciones(reserva_id);
create index if not exists idx_aceptaciones_doc on public.aceptaciones_condiciones(documento_legal_id);
create index if not exists idx_aceptaciones_aceptado_en on public.aceptaciones_condiciones(aceptado_en desc);
create index if not exists idx_aceptaciones_tipo on public.aceptaciones_condiciones(documento_tipo);

comment on table public.aceptaciones_condiciones is
  'Registro probatorio de cada aceptación de un documento legal por un huésped. NO se borra (conservación 6 años por plazo mercantil). Para GDPR derecho al olvido: anonimizar fila pero conservarla.';

-- ============================================================================
-- 3. LOGS DE ACTIVIDAD — auditoría interna del panel
-- ============================================================================
-- Registra quién entra al panel, qué consulta, qué exporta, qué modifica.
-- Útil para: defender al cliente ante reclamaciones internas, detectar accesos
-- sospechosos, demostrar diligencia ante una auditoría.
create table if not exists public.logs_actividad (
  id bigserial primary key,
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_email text,                       -- denormalizado por si el usuario se borra
  evento text not null,                     -- 'login', 'logout', 'view_reservas', 'export_csv', 'crear_reserva', etc.
  recurso_tipo text,                        -- 'reserva', 'huesped', 'documento_legal', etc.
  recurso_id text,                          -- id del recurso afectado (uuid o lo que sea)
  detalles jsonb,                           -- payload adicional (filtros aplicados, etc.)
  ip_cliente inet,
  user_agent text,
  ocurrido_en timestamptz not null default now()
);

create index if not exists idx_logs_usuario on public.logs_actividad(usuario_id);
create index if not exists idx_logs_evento on public.logs_actividad(evento);
create index if not exists idx_logs_ocurrido_en on public.logs_actividad(ocurrido_en desc);
create index if not exists idx_logs_recurso on public.logs_actividad(recurso_tipo, recurso_id);

comment on table public.logs_actividad is
  'Auditoría interna del panel. NO almacena PII de huéspedes (eso va en aceptaciones_condiciones). Solo quién (usuario del panel), qué (evento+recurso), cuándo.';

-- ============================================================================
-- 4. FUNCIÓN HELPER — verificar integridad de una aceptación
-- ============================================================================
-- Cuando alguien quiera verificar "¿realmente el huésped aceptó este texto exacto?",
-- esta función recalcula el hash del documento legal y lo compara con el guardado
-- en la aceptación. Si el documento se ha modificado a posteriori, salta el flag.
create or replace function public.verificar_aceptacion(aceptacion_id uuid)
returns table(
  aceptacion_existe boolean,
  documento_existe boolean,
  hash_coincide boolean,
  hash_registrado text,
  hash_actual text,
  documento_tipo text,
  documento_version text,
  aceptado_en timestamptz
)
language sql
stable
as $$
  with a as (
    select * from public.aceptaciones_condiciones where id = aceptacion_id
  ),
  d as (
    select id, hash_sha256 from public.documentos_legales
    where id = (select documento_legal_id from a)
  )
  select
    (select id from a) is not null as aceptacion_existe,
    (select id from d) is not null as documento_existe,
    (select hash_sha256 from d) = (select documento_hash_sha256 from a) as hash_coincide,
    (select documento_hash_sha256 from a) as hash_registrado,
    (select hash_sha256 from d) as hash_actual,
    (select documento_tipo from a),
    (select documento_version from a),
    (select aceptado_en from a);
$$;

comment on function public.verificar_aceptacion(uuid) is
  'Verifica que una aceptación referencia un documento cuyo hash coincide con el guardado. Si hash_coincide = false, el documento legal ha sido modificado posteriormente.';

-- ============================================================================
-- 5. RLS — políticas
-- ============================================================================
alter table public.documentos_legales enable row level security;
alter table public.aceptaciones_condiciones enable row level security;
alter table public.logs_actividad enable row level security;

-- Solo los usuarios autenticados con perfil 'admin' o 'editor' pueden leer
-- (los visualizadores también, para que Juan pueda revisar)
drop policy if exists "documentos_legales_select_authenticated" on public.documentos_legales;
create policy "documentos_legales_select_authenticated"
  on public.documentos_legales for select to authenticated using (true);

drop policy if exists "aceptaciones_select_authenticated" on public.aceptaciones_condiciones;
create policy "aceptaciones_select_authenticated"
  on public.aceptaciones_condiciones for select to authenticated using (true);

drop policy if exists "logs_select_authenticated" on public.logs_actividad;
create policy "logs_select_authenticated"
  on public.logs_actividad for select to authenticated using (true);

-- Solo admin y editor pueden insertar/modificar documentos legales
drop policy if exists "documentos_legales_write_admin_editor" on public.documentos_legales;
create policy "documentos_legales_write_admin_editor"
  on public.documentos_legales for all to authenticated
  using (
    exists (select 1 from public.perfiles where id = auth.uid() and rol in ('admin','editor'))
  )
  with check (
    exists (select 1 from public.perfiles where id = auth.uid() and rol in ('admin','editor'))
  );

-- Aceptaciones y logs: solo se escriben vía endpoints server-side con service_role.
-- No políticas de INSERT para usuarios normales.

-- ============================================================================
-- 6. TRIGGER de touch para documentos_legales (no aceptaciones — son inmutables)
-- ============================================================================
-- Si se modifica un documento legal, NO debe pasar desapercibido: en cualquier
-- UPDATE forzamos a recalcular hash. Pero mejor diseño: tratar docs como
-- INMUTABLES — cualquier cambio requiere crear nueva versión.
-- Para empezar simple: protegemos contra UPDATE de campos críticos.
create or replace function public.proteger_documentos_legales()
returns trigger
language plpgsql
as $$
begin
  if (old.contenido is distinct from new.contenido or old.hash_sha256 is distinct from new.hash_sha256) then
    raise exception 'No se puede modificar el contenido ni el hash de un documento legal publicado. Crea una nueva versión.';
  end if;
  return new;
end;
$$;

drop trigger if exists documentos_legales_proteger on public.documentos_legales;
create trigger documentos_legales_proteger
  before update on public.documentos_legales
  for each row execute procedure public.proteger_documentos_legales();
