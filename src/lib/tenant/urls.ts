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
    if (primary) return `${baseUrlForHost(primary.domain)}/`;
  }
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/t/${slug}`;
}
