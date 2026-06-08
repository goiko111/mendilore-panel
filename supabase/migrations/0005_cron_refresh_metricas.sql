-- ============================================================================
-- Migration 0005 — Cron diario REFRESH metricas_dia
-- ============================================================================
-- La vista materializada public.metricas_dia se calcula desde reservas.
-- Sin refresh los KPIs quedan obsoletos según pasan los días.
-- Programamos pg_cron para refrescar cada día a las 06:00 UTC (08:00 Europe/Madrid en verano).
--
-- Requiere extensión pg_cron habilitada en Supabase (activa por defecto en eu-central-1).
-- Si no estuviera: create extension if not exists pg_cron with schema extensions;
-- ============================================================================

create extension if not exists pg_cron with schema extensions;

-- Borrar si existe (idempotente)
do $$
begin
  perform cron.unschedule('refresh-metricas-dia');
exception when others then
  null;
end$$;

-- Programar: cada día a las 06:00 UTC
select cron.schedule(
  'refresh-metricas-dia',
  '0 6 * * *',
  $$refresh materialized view public.metricas_dia;$$
);

-- Verificación (devolverá la fila del cron creado)
select jobid, schedule, command, active from cron.job where jobname = 'refresh-metricas-dia';
