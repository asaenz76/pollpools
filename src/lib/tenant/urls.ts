import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicEnv } from "@/lib/env";
import { baseUrlForHost } from "@/lib/domain/domains";

/**
 * Absolute URL for a tenant's home, bound to the tenant's PRIMARY domain (Phase
 * 8B.8). Used for auth emails (magic link, password reset) and any link that must
 * return to the tenant — everything returns to the tenant's own domain. Falls back
 * to the platform app URL + /t/{slug} when the tenant has no verified primary
 * custom domain. The slug and domain come from the database, never from
 * client-supplied return URLs (which are never trusted; see safeReturnPath).
 */
export async function resolveTenantHomeUrl(
  supabase: SupabaseClient<Database>,
  slug: string,
): Promise<string> {
  return resolveTenantUrl(supabase, slug, "/");
}

/**
 * Absolute, SERVER-DERIVED URL for a path within a tenant, bound to the tenant's
 * PRIMARY custom domain when it has a verified one (so the browser URL stays clean —
 * `https://marblegrandprix.com/billing`), else the platform fallback
 * `${APP_URL}/t/{slug}/billing`. `subpath` MUST be a caller-controlled application
 * path beginning with "/" (e.g. "/billing?status=pending") — never a client-supplied
 * URL. This is the single safe way to build tenant return/redirect URLs (billing,
 * auth emails); it prevents open redirects by construction.
 */
export async function resolveTenantUrl(
  supabase: SupabaseClient<Database>,
  slug: string,
  subpath: string,
): Promise<string> {
  const path = subpath.startsWith("/") ? subpath : `/${subpath}`;
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (tenant) {
    const { data: primary } = await supabase
      .from("tenant_domains")
      .select("domain")
      .eq("tenant_id", tenant.id)
      .eq("is_primary", true)
      .eq("verified", true)
      .maybeSingle();
    // On the primary custom domain the tenant is served at the root — no /t/{slug}.
    if (primary) return `${baseUrlForHost(primary.domain)}${path === "/" ? "/" : path}`;
  }
  // Platform fallback keeps the /t/{slug} prefix. "/" collapses to the bare home.
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/t/${slug}${path === "/" ? "" : path}`;
}
