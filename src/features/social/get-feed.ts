import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { FeedActivityType } from "@/types/enums";

export type FeedItem = {
  id: string;
  type: FeedActivityType;
  createdAt: string;
  text: string;
  href: string | null;
};

/** Stable keyset cursor: the (created_at, id) of the last item on the page. */
export type FeedCursor = { createdAt: string; id: string };
export type FeedPage = { items: FeedItem[]; nextCursor: FeedCursor | null };

type FeedRow = {
  id: string;
  type: string;
  actor_user_id: string | null;
  actor_creator_id: string | null;
  subject_user_id: string | null;
  event_id: string | null;
  competition_id: string | null;
  metadata: unknown;
  created_at: string;
};

/**
 * The tenant activity feed (spec §18), keyset-paginated (F-18). Ordered by
 * (created_at DESC, id DESC) for a deterministic total order even across equal
 * timestamps; the next page is fetched with a `(created_at, id)` cursor — never
 * OFFSET, so it can't skip or duplicate rows as new activity arrives. Public
 * activity only, tenant-scoped.
 */
export async function getFeed(
  tenantId: string,
  tenantSlug: string,
  opts: { limit?: number; cursor?: FeedCursor | null } = {},
): Promise<FeedPage> {
  const supabase = await createServerSupabase();
  const limit = Math.min(Math.max(1, opts.limit ?? 40), 100);

  let query = supabase
    .from("feed_activities")
    .select("id, type, actor_user_id, actor_creator_id, subject_user_id, event_id, competition_id, metadata, created_at")
    .eq("tenant_id", tenantId);

  if (opts.cursor) {
    // Row-value keyset: strictly "older than" the cursor in the (created_at, id) order.
    query = query.or(
      `created_at.lt.${opts.cursor.createdAt},and(created_at.eq.${opts.cursor.createdAt},id.lt.${opts.cursor.id})`,
    );
  }

  // Fetch one extra row to detect whether a further page exists.
  const { data } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  const all = (data ?? []) as FeedRow[];
  const hasMore = all.length > limit;
  const rows = hasMore ? all.slice(0, limit) : all;
  if (rows.length === 0) return { items: [], nextCursor: null };

  const items = await enrichFeedRows(supabase, tenantId, tenantSlug, rows);
  const last = rows[rows.length - 1]!;
  const nextCursor = hasMore ? { createdAt: last.created_at, id: last.id } : null;
  return { items, nextCursor };
}

async function enrichFeedRows(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  tenantId: string,
  tenantSlug: string,
  rows: FeedRow[],
): Promise<FeedItem[]> {
  const creatorIds = [...new Set(rows.map((r) => r.actor_creator_id).filter(Boolean) as string[])];
  const eventIds = [...new Set(rows.map((r) => r.event_id).filter(Boolean) as string[])];
  const userIds = [...new Set([...rows.map((r) => r.actor_user_id), ...rows.map((r) => r.subject_user_id)].filter(Boolean) as string[])];

  const [creators, events, profiles] = await Promise.all([
    creatorIds.length ? supabase.from("creators").select("id, display_name, slug").in("id", creatorIds) : Promise.resolve({ data: [] }),
    eventIds.length ? supabase.from("events").select("id, title, slug").in("id", eventIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("profiles").select("user_id, display_name, handle").eq("tenant_id", tenantId).in("user_id", userIds) : Promise.resolve({ data: [] }),
  ]);

  const creatorById = new Map((creators.data ?? []).map((c) => [c.id, c]));
  const eventById = new Map((events.data ?? []).map((e) => [e.id, e]));
  const profileByUser = new Map((profiles.data ?? []).map((p) => [p.user_id, p]));

  const items: FeedItem[] = [];
  for (const r of rows) {
    const creator = r.actor_creator_id ? creatorById.get(r.actor_creator_id) : undefined;
    const event = r.event_id ? eventById.get(r.event_id) : undefined;
    const actor = r.actor_user_id ? profileByUser.get(r.actor_user_id) : undefined;
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const eventHref = event ? `/t/${tenantSlug}/e/${event.slug}` : null;

    let text = "";
    let href: string | null = eventHref;
    switch (r.type) {
      case "creator_published_event":
        text = `${creator?.display_name ?? "A creator"} published ${event?.title ?? "an event"}`;
        break;
      case "user_submitted_prediction":
        text = `${actor?.display_name ?? "Someone"} made a prediction on ${event?.title ?? "an event"}`;
        break;
      case "user_earned_achievement":
        text = `${actor?.display_name ?? "Someone"} earned "${String(meta.achievement_name ?? "an achievement")}"`;
        href = actor?.handle ? `/t/${tenantSlug}/u/${actor.handle}` : null;
        break;
      case "event_settled": {
        const resultLabel = typeof meta.result_label === "string" ? meta.result_label : null;
        text = resultLabel
          ? `${event?.title ?? "An event"} was settled — result: ${resultLabel}`
          : `${event?.title ?? "An event"} was settled`;
        break;
      }
      default:
        text = "New activity";
    }
    items.push({ id: r.id, type: r.type as FeedActivityType, createdAt: r.created_at, text, href });
  }
  return items;
}
