import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const SUPABASE_URL = "https://itaftpmelcswvphzqgkc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_e-zLObL9GxPumv9ZRE4-Wg_cVX72YTB";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        }
      }
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith("/login");
  const isApiWebhook = request.nextUrl.pathname.startsWith("/api/webhook");
  const isAceptarPublico = request.nextUrl.pathname.startsWith("/aceptar");
  const isApiAceptar = request.nextUrl.pathname.startsWith("/api/aceptar-condiciones");
  const isApiCron = request.nextUrl.pathname.startsWith("/api/cron");
  const isApiExport = request.nextUrl.pathname.startsWith("/api/export");

  // Redirect: si no hay usuario y no estamos en login/webhook/aceptar/cron (público o auth-by-header) → /login
  if (!user && !isAuthPage && !isApiWebhook && !isAceptarPublico && !isApiAceptar && !isApiCron && !isApiExport) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Si hay usuario y estamos en /login → al dashboard
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
