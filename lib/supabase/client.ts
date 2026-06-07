import { createBrowserClient } from "@supabase/ssr";

// Constantes públicas — Supabase publishable_key está diseñada para ser pública.
// Hardcodeadas porque CF Pages no inyecta NEXT_PUBLIC_* env vars al runtime de Functions.
const SUPABASE_URL = "https://itaftpmelcswvphzqgkc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_e-zLObL9GxPumv9ZRE4-Wg_cVX72YTB";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
