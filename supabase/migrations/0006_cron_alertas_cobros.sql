-- ============================================================================
-- Migration 0006 — Cron diario alertas cobros pendientes
-- ============================================================================
-- pg_cron + pg_net (Supabase ya las tiene habilitadas) llaman al endpoint
-- /api/cron/alertas-cobros del panel cada día a las 07:00 UTC (09:00 Madrid).
-- El endpoint revisa BD, formatea email HTML y envía via Resend a
-- info@mendilore.com + mendilore@mendilore.com.
--
-- Requisitos para activación:
--   1. CRON_SECRET añadido como env var en CF Pages (cualquier string aleatorio largo)
--   2. RESEND_API_KEY añadido en CF Pages (API key de Resend, plan gratuito 3k emails/mes)
--   3. (Opcional) RESEND_DOMAIN_VERIFICADO=true si Goiko verifica mendilore.com en Resend
--   4. La siguiente función SQL referencia el CRON_SECRET — actualizar antes de ejecutar
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Borrar si existe (idempotente)
do $$
begin
  perform cron.unschedule('alertas-cobros-diario');
exception when others then null;
end$$;

-- Programar diario 07:00 UTC = 09:00 hora Madrid en verano (08:00 en invierno)
-- El cron llama POST al endpoint usando pg_net (HTTP async).
-- IMPORTANTE: reemplazar 'REPLACE_CRON_SECRET_AQUI' por el valor real del CRON_SECRET
-- ya configurado en CF Pages env vars.
select cron.schedule(
  'alertas-cobros-diario',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://panel.mendilore.com/api/cron/alertas-cobros',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REPLACE_CRON_SECRET_AQUI'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Verificación
select jobid, schedule, command, active from cron.job where jobname = 'alertas-cobros-diario';
