-- Migration 0012: features sesión 11 ext — tareas + notas + audit_log + objetivos + partes policía

-- TABLA: tareas/recordatorios (punto #6 + #1)
CREATE TABLE IF NOT EXISTS public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  fecha_limite date,
  prioridad text not null default 'normal' check (prioridad in ('baja', 'normal', 'alta')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'completada', 'cancelada')),
  reserva_id uuid references public.reservas(id) on delete set null,
  huesped_id uuid references public.huespedes(id) on delete set null,
  asignado_a text,
  completada_en timestamptz,
  creada_en timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_tareas_estado_fecha ON public.tareas (estado, fecha_limite);

-- TABLA: audit_log (punto #14)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entidad_tipo text not null,
  entidad_id uuid not null,
  accion text not null,
  cambios jsonb default '{}'::jsonb,
  usuario_email text,
  creado_en timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entidad ON public.audit_log (entidad_tipo, entidad_id, creado_en desc);

-- TABLA: objetivos_mensuales (punto #10)
CREATE TABLE IF NOT EXISTS public.objetivos_mensuales (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  ingresos_target numeric(12,2),
  ocupacion_target_pct numeric(5,2),
  noches_target integer,
  notas text,
  creado_en timestamptz not null default now(),
  unique(year, month)
);

-- TABLA: partes_policia (punto #9 — RD 933/2021)
CREATE TABLE IF NOT EXISTS public.partes_policia (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid references public.reservas(id) on delete cascade,
  huesped_id uuid references public.huespedes(id) on delete cascade,
  fecha_envio timestamptz,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'rechazado', 'no_aplica')),
  referencia_ses text,
  respuesta_ses jsonb default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_partes_estado ON public.partes_policia (estado, fecha_envio);

-- AMPLIACION: huespedes con campos para parte policía (punto #9)
ALTER TABLE public.huespedes ADD COLUMN IF NOT EXISTS dni text;
ALTER TABLE public.huespedes ADD COLUMN IF NOT EXISTS pasaporte text;
ALTER TABLE public.huespedes ADD COLUMN IF NOT EXISTS fecha_nacimiento date;
ALTER TABLE public.huespedes ADD COLUMN IF NOT EXISTS nacionalidad text;
ALTER TABLE public.huespedes ADD COLUMN IF NOT EXISTS notas_privadas text;
ALTER TABLE public.huespedes ADD COLUMN IF NOT EXISTS preferencias jsonb default '{}'::jsonb;

-- TABLA: enlaces_legales_enviados (punto #4)
CREATE TABLE IF NOT EXISTS public.enlaces_legales_enviados (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid references public.reservas(id) on delete cascade not null,
  huesped_email text,
  enviado_en timestamptz not null default now(),
  aceptado_en timestamptz,
  metodo text default 'email'
);
CREATE INDEX IF NOT EXISTS idx_enlaces_reserva ON public.enlaces_legales_enviados (reserva_id);

-- RLS para nuevas tablas
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objetivos_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partes_policia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enlaces_legales_enviados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tareas_authenticated_all" ON public.tareas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "audit_log_authenticated_select" ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "objetivos_authenticated_all" ON public.objetivos_mensuales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "partes_authenticated_all" ON public.partes_policia FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "enlaces_authenticated_all" ON public.enlaces_legales_enviados FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger audit_log para cambios en reservas
CREATE OR REPLACE FUNCTION public.audit_reservas() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF row_to_json(OLD)::jsonb <> row_to_json(NEW)::jsonb THEN
      INSERT INTO public.audit_log (entidad_tipo, entidad_id, accion, cambios)
      VALUES (
        'reserva',
        NEW.id,
        'update',
        jsonb_build_object(
          'antes', jsonb_build_object('estado_cobro', OLD.estado_cobro, 'estado_reserva', OLD.estado_reserva, 'importe_total', OLD.importe_total),
          'despues', jsonb_build_object('estado_cobro', NEW.estado_cobro, 'estado_reserva', NEW.estado_reserva, 'importe_total', NEW.importe_total)
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_reservas ON public.reservas;
CREATE TRIGGER trg_audit_reservas AFTER UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.audit_reservas();

-- Seed: tarea de bienvenida
INSERT INTO public.tareas (titulo, descripcion, prioridad, estado)
VALUES (
  '🎯 Definir objetivos mensuales de ingresos',
  'Ve a /objetivos para configurar el target mensual de ingresos. Esto permitirá ver desviación real vs target.',
  'normal',
  'pendiente'
)
ON CONFLICT DO NOTHING;
