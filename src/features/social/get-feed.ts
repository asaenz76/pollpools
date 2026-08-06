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

/** The tenant activity feed (spec §18). Public activity only; no private data. */
export async function getFeed(tenantId: string, tenantSlug: string, limit = 40): Promise<FeedItem[]> {
  const supabase = await createServerSupabase();

  const { data: rows } = await supabase
    .from("feed_activities")
    .select("id, type, actor_user_id, actor_creator_id, subject_user_id, event_id, competition_id, metadata, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!rows || rows.length === 0) return [];

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
