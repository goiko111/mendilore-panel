import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - api/webhook (these have own auth via secret header)
     * - api/oauth/google (public OAuth endpoints — Google redirects here without auth)
     * - images, .svg, .png, .jpg, .jpeg, .gif, .webp
     */
    "/((?!_next/static|_next/image|favicon.ico|api/webhook|api/oauth/google|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
