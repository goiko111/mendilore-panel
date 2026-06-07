import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const SUPABASE_URL = "https://itaftpmelcswvphzqgkc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_e-zLObL9GxPumv9ZRE4-Wg_cVX72YTB";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Component context — middleware refresca la sesión
          }
        }
      }
    }
  );
}

/**
 * Cliente con permisos de service_role para acciones admin (webhooks, migraciones).
 * NO usar nunca desde componentes cliente. Solo desde Route Handlers / Server Actions.
 */
export function createAdminClient() {
  return createServerClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          /* no-op */
        }
      }
    }
  );
}
