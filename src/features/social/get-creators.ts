import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";

export type CreatorListItem = {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  avatarUrl: string | null;
  followers: number;
};

export async function listCreators(tenantId: string): Promise<CreatorListItem[]> {
  const supabase = await createServerSupabase();
  const { data: creators } = await supabase
    .from("creators")
    .select("id, slug, display_name, description, avatar_url")
    .eq("tenant_id", tenantId)
    .eq("verification_status", "verified")
    .order("display_name");

  const ids = (creators ?? []).map((c) => c.id);
  const followerCount = new Map<string, number>();
  if (ids.length) {
    const { data: follows } = await supabase.from("creator_follows").select("creator_id").in("creator_id", ids);
    for (const f of follows ?? []) followerCount.set(f.creator_id, (followerCount.get(f.creator_id) ?? 0) + 1);
  }

  return (creators ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    displayName: c.display_name,
    description: c.description,
    avatarUrl: c.avatar_url,
    followers: followerCount.get(c.id) ?? 0,
  }));
}

export type CreatorProfileView = CreatorListItem & {
  bannerUrl: string | null;
  isFollowing: boolean;
  events: { id: string; title: string; slug: string; status: string }[];
};

export async function getCreatorProfile(
  tenantId: string,
  slug: string,
  viewerUserId: string | null,
): Promise<CreatorProfileView | null> {
  const supabase = await createServerSupabase();
  const { data: creator } = await supabase
    .from("creators")
    .select("id, slug, display_name, description, avatar_url, banner_url")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (!creator) return null;

  const [{ count: followers }, following, { data: events }] = await Promise.all([
    supabase.from("creator_follows").select("*", { count: "exact", head: true }).eq("creator_id", creator.id),
    viewerUserId
      ? supabase.from("creator_follows").select("id").eq("creator_id", creator.id).eq("user_id", viewerUserId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("events")
      .select("id, title, slug, status")
      .eq("creator_id", creator.id)
      .neq("status", "draft")
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  return {
    id: creator.id,
    slug: creator.slug,
    displayName: creator.display_name,
    description: creator.description,
    avatarUrl: creator.avatar_url,
    bannerUrl: creator.banner_url,
    followers: followers ?? 0,
    isFollowing: Boolean(following.data),
    events: (events ?? []).map((e) => ({ id: e.id, title: e.title, slug: e.slug, status: e.status })),
  };
}
