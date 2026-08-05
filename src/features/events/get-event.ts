import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { computeSentiment, type Sentiment } from "@/lib/domain/sentiment";
import { getLockState, type LockState } from "@/lib/domain/locking";
import type { MarketStatus, MarketType, EventStatus } from "@/types/enums";

export type EventOption = {
  id: string;
  label: string;
  color: string | null;
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

export type EventDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: EventStatus;
  startsAt: string | null;
  locksAt: string | null;
  youtubeUrl: string | null;
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

  const { data: marketRows } = await supabase
    .from("markets")
    .select("id, question, type, status, locks_at")
    .eq("event_id", event.id)
    .neq("status", "draft")
    .order("created_at");

  const user = await getSessionUser();

  const markets: EventMarket[] = [];
  for (const m of marketRows ?? []) {
    const { data: optionRows } = await supabase
      .from("market_options")
      .select("id, label, color, image_url, competitor_id, display_order, status")
      .eq("market_id", m.id)
      .in("status", ["active", "winner", "loser", "voided"])
      .order("display_order");

    const winningOptionId = (optionRows ?? []).find((o) => o.status === "winner")?.id ?? null;
    const settled = m.status === "settled" || m.status === "voided" || m.status === "canceled";

    const { data: sentimentRows } = await supabase.rpc("market_sentiment", { p_market_id: m.id });

    // Map RPC counts onto options (in display order).
    const votesById = new Map<string, number>(
      (sentimentRows ?? []).map((r) => [r.option_id as string, Number(r.votes)]),
    );
    const sentiment = computeSentiment(
      (optionRows ?? []).map((o) => ({
        optionId: o.id,
        label: o.label,
        votes: votesById.get(o.id) ?? 0,
      })),
    );

    let userOptionId: string | null = null;
    let userOutcome: EventMarket["userOutcome"] = null;
    if (user) {
      const { data: pred } = await supabase
        .from("predictions")
        .select("option_id, status")
        .eq("market_id", m.id)
        .eq("user_id", user.id)
        .maybeSingle();
      userOptionId = pred?.option_id ?? null;
      if (pred?.status === "correct" || pred?.status === "incorrect" || pred?.status === "void") {
        userOutcome = pred.status;
      }
    }

    const lockState = getLockState({
      marketStatus: m.status as MarketStatus,
      marketLocksAt: m.locks_at,
      eventLocksAt: event.locks_at,
      now,
    });

    markets.push({
      id: m.id,
      question: m.question,
      type: m.type as MarketType,
      status: m.status as MarketStatus,
      locksAt: m.locks_at,
      options: (optionRows ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        color: o.color,
        imageUrl: o.image_url,
        competitorId: o.competitor_id,
      })),
      sentiment,
      userOptionId,
      lockState,
      settled,
      winningOptionId,
      userOutcome,
    });
  }

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
