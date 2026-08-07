"use server";

import { getFeed, type FeedCursor, type FeedPage } from "@/features/social/get-feed";
import { createServerSupabase } from "@/lib/supabase/server";
import { isValidTenantSlug } from "@/lib/tenant/resolver";

/**
 * Fetch the next feed page from a keyset cursor (F-18). Resolves the tenant from
 * the slug server-side (never trusting a client-supplied tenant id) and delegates
 * to the tenant-scoped keyset query.
 */
export async function loadMoreFeedAction(tenantSlug: string, cursor: FeedCursor): Promise<FeedPage> {
  if (!isValidTenantSlug(tenantSlug) || !cursor?.createdAt || !cursor?.id) return { items: [], nextCursor: null };
  const supabase = await createServerSupabase();
  const { data: tenant } = await supabase.from("tenants").select("id").eq("slug", tenantSlug).eq("status", "active").maybeSingle();
  if (!tenant) return { items: [], nextCursor: null };
  return getFeed(tenant.id, tenantSlug, { cursor });
}
