-- Migration 0013: OAuth tokens GA4 user-delegated
CREATE TABLE IF NOT EXISTS public.ga4_tokens (
  id uuid primary key default gen_random_uuid(),
  google_email text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  property_id text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique(google_email)
);

ALTER TABLE public.ga4_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ga4_tokens_authenticated" ON public.ga4_tokens;
CREATE POLICY "ga4_tokens_authenticated" ON public.ga4_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
