import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { computeSentiment, type Sentiment } from "@/lib/domain/sentiment";
import { getLockState, type LockState } from "@/lib/domain/locking";
import type { MarketStatus, MarketType, EventStatus, EventMediaType } from "@/types/enums";

export type EventOption = {
  id: string;
  label: string;
  color: string | null;
  colors: string[];
  identifier: string | null;
  imageUrl: string | null;
  competitorId: string | null;
};

export type EventMarket = {
  id: string;
  question: string;
  type: MarketType;
  status: MarketStatus;
  locksAt: string | null;
  options: EventOption[];
  sentiment: Sentiment;
  userOptionId: string | null;
  lockState: LockState;
  settled: boolean;
  winningOptionId: string | null;
  /** The signed-in user's graded outcome for this market, if settled. */
  userOutcome: "correct" | "incorrect" | "void" | null;
};

export type EventMedia = {
  id: string;
  provider: string;
  mediaType: EventMediaType;
  url: string;
  label: string | null;
  thumbnailUrl: string | null;
  isPrimary: boolean;
};

export type EventDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: EventStatus;
  startsAt: string | null;
  locksAt: string | null;
  /** @deprecated legacy field; use `media`. Retained for backward compatibility. */
  youtubeUrl: string | null;
  media: EventMedia[];
  coverImageUrl: string | null;
  creator: { displayName: string; slug: string; avatarUrl: string | null } | null;
  markets: EventMarket[];
  serverNow: string;
};

export async function getEventBySlug(tenantId: string, slug: string): Promise<EventDetail | null> {
  const supabase = await createServerSupabase();
  const now = new Date();

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, title, slug, description, status, starts_at, locks_at, youtube_url, cover_image_url, creators(display_name, slug, avatar_url)",
    )
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();

  if (!event) return null;

  const { data: mediaRows } = await supabase
    .from("event_media_links")
    .select("id, provider, media_type, url, label, thumbnail_url, is_primary")
    .eq("event_id", event.id)
    .order("is_primary", { ascending: false })
    .order("created_at");

  const { data: marketRows } = await supabase
    .from("markets")
    .select("id, question, type, status, locks_at")
    .eq("event_id", event.id)
    .neq("status", "draft")
    .order("created_at");

  const user = await getSessionUser();
  const marketIds = (marketRows ?? []).map((m) => m.id);

  // Batched reads (F-17): options, sentiment, and the user's predictions for ALL
  // markets in three queries total — never one-per-market. Bounded regardless of
  // how many markets the event has.
  const [optionsRes, sentimentRes, userPredsRes] = await Promise.all([
    marketIds.length
      ? supabase
          .from("market_options")
          .select("id, market_id, label, color, image_url, competitor_id, display_order, status, competitors(visual_colors, identifier, image_url)")
          .in("market_id", marketIds)
          .in("status", ["active", "winner", "loser", "voided"])
          .order("display_order")
      : Promise.resolve({ data: null }),
    marketIds.length ? supabase.rpc("markets_sentiment", { p_market_ids: marketIds }) : Promise.resolve({ data: null }),
    user && marketIds.length
      ? supabase.from("predictions").select("market_id, option_id, status").in("market_id", marketIds).eq("user_id", user.id)
      : Promise.resolve({ data: null }),
  ]);

  type OptionRow = {
    id: string; market_id: string; label: string; color: string | null; image_url: string | null;
    competitor_id: string | null; display_order: number; status: string;
    competitors?: { visual_colors: string[] | null; identifier: string | null; image_url: string | null } | { visual_colors: string[] | null; identifier: string | null; image_url: string | null }[] | null;
  };
  const allOptions = (optionsRes.data ?? []) as OptionRow[];

  // Group the batched rows by market_id in memory.
  const optionsByMarket = new Map<string, OptionRow[]>();
  for (const o of allOptions) {
    const list = optionsByMarket.get(o.market_id) ?? [];
    list.push(o);
    optionsByMarket.set(o.market_id, list);
  }
  const votesByMarket = new Map<string, Map<string, number>>();
  for (const r of (sentimentRes.data ?? []) as { market_id: string; option_id: string; votes: number }[]) {
    const inner = votesByMarket.get(r.market_id) ?? new Map<string, number>();
    inner.set(r.option_id, Number(r.votes));
    votesByMarket.set(r.market_id, inner);
  }
  const userPredByMarket = new Map<string, { option_id: string | null; status: string }>();
  for (const p of (userPredsRes.data ?? []) as { market_id: string; option_id: string | null; status: string }[]) {
    userPredByMarket.set(p.market_id, { option_id: p.option_id, status: p.status });
  }

  const markets: EventMarket[] = (marketRows ?? []).map((m) => {
    const optionRows = optionsByMarket.get(m.id) ?? [];
    const winningOptionId = optionRows.find((o) => o.status === "winner")?.id ?? null;
    const settled = m.status === "settled" || m.status === "voided" || m.status === "canceled";

    const votesById = votesByMarket.get(m.id) ?? new Map<string, number>();
    const sentiment = computeSentiment(
      optionRows.map((o) => ({ optionId: o.id, label: o.label, votes: votesById.get(o.id) ?? 0 })),
    );

    const pred = userPredByMarket.get(m.id);
    const userOptionId = pred?.option_id ?? null;
    const userOutcome: EventMarket["userOutcome"] =
      pred?.status === "correct" || pred?.status === "incorrect" || pred?.status === "void" ? pred.status : null;

    const lockState = getLockState({
      marketStatus: m.status as MarketStatus,
      marketLocksAt: m.locks_at,
      eventLocksAt: event.locks_at,
      now,
    });

    return {
      id: m.id,
      question: m.question,
      type: m.type as MarketType,
      status: m.status as MarketStatus,
      locksAt: m.locks_at,
      options: optionRows.map((o) => {
        const comp = Array.isArray(o.competitors) ? o.competitors[0] : o.competitors;
        return {
          id: o.id,
          label: o.label,
          color: o.color,
          colors: (comp?.visual_colors ?? []) as string[],
          identifier: comp?.identifier ?? null,
          imageUrl: comp?.image_url ?? o.image_url,
          competitorId: o.competitor_id,
        };
      }),
      sentiment,
      userOptionId,
      lockState,
      settled,
      winningOptionId,
      userOutcome,
    };
  });

  const creator = Array.isArray(event.creators) ? event.creators[0] : event.creators;

  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    description: event.description,
    status: event.status as EventStatus,
    startsAt: event.starts_at,
    locksAt: event.locks_at,
    youtubeUrl: event.youtube_url,
    media: (mediaRows ?? []).map((m) => ({
      id: m.id,
      provider: m.provider,
      mediaType: m.media_type as EventMediaType,
      url: m.url,
      label: m.label,
      thumbnailUrl: m.thumbnail_url,
      isPrimary: m.is_primary,
    })),
    coverImageUrl: event.cover_image_url,
    creator: creator
      ? { displayName: creator.display_name, slug: creator.slug, avatarUrl: creator.avatar_url }
      : null,
    markets,
    serverNow: now.toISOString(),
  };
}

export type EventListItem = {
  id: string;
  title: string;
  slug: string;
  status: EventStatus;
  startsAt: string | null;
  locksAt: string | null;
  coverImageUrl: string | null;
  creator: string | null;
};

/** Published/active events for a tenant, soonest lock first. */
export async function listEvents(tenantId: string): Promise<EventListItem[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("events")
    .select("id, title, slug, status, starts_at, locks_at, cover_image_url, creators(display_name)")
    .eq("tenant_id", tenantId)
    .neq("status", "draft")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(50);

  return (data ?? []).map((e) => {
    const creator = Array.isArray(e.creators) ? e.creators[0] : e.creators;
    return {
      id: e.id,
      title: e.title,
      slug: e.slug,
      status: e.status as EventStatus,
      startsAt: e.starts_at,
      locksAt: e.locks_at,
      coverImageUrl: e.cover_image_url,
      creator: creator?.display_name ?? null,
    };
  });
}
