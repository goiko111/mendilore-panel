import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon
     * - api/webhook (own auth via secret header)
     * - api/oauth/google (public OAuth callback)
     * - api/admin (own auth via x-admin-secret header)
     * - api/cron (own auth via x-cron-secret header)
     * - api/aceptar-condiciones (public form)
     * - images
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhook|api/oauth/google|api/admin|api/cron|api/aceptar-condiciones|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
