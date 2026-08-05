import type { NextRequest } from "next/server";
import { updateSessionAndTenant } from "@/lib/supabase/middleware";

// Next.js 16 "proxy" convention (formerly "middleware"). Runs on every real
// navigation to refresh the Supabase session and resolve the tenant server-side.
export function proxy(request: NextRequest) {
  return updateSessionAndTenant(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image files, so the
     * session refresh + tenant resolution run on every real navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
