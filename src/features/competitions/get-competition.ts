import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { CompetitionType, CompetitionStatus } from "@/types/enums";
import type { EventListItem } from "@/features/events/get-event";

export type BracketMatchView = {
  matchIndex: number;
  roundNumber: number;
  roundName: string;
  position: number;
  competitorA: string | null;
  competitorB: string | null;
  winner: string | null;
  isBye: boolean;
  eventSlug: string | null;
  status: string;
};

export type CompetitionDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  type: CompetitionType;
  status: CompetitionStatus;
  startsAt: string | null;
  endsAt: string | null;
  creator: string | null;
  events: EventListItem[];
  bracket: { rounds: { number: number; name: string }[]; matches: BracketMatchView[] } | null;
};

export async function getCompetitionBySlug(
  tenantId: string,
  slug: string,
): Promise<CompetitionDetail | null> {
  const supabase = await createServerSupabase();

  const { data: comp } = await supabase
    .from("competitions")
    .select("id, title, slug, description, type, status, starts_at, ends_at, creators(display_name)")
    .eq("tenant_id", tenantId)
    .eq("slug", slug)
    .maybeSingle();
  if (!comp) return null;

  const { data: eventRows } = await supabase
    .from("events")
    .select("id, title, slug, status, starts_at, locks_at, cover_image_url")
    .eq("competition_id", comp.id)
    .neq("status", "draft")
    .order("starts_at", { ascending: true, nullsFirst: false });

  const events: EventListItem[] = (eventRows ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    status: e.status as EventListItem["status"],
    startsAt: e.starts_at,
    locksAt: e.locks_at,
    coverImageUrl: e.cover_image_url,
    creator: null,
  }));

  let bracket: CompetitionDetail["bracket"] = null;
  if (comp.type === "BRACKET") {
    const [{ data: rounds }, { data: slots }, { data: competitors }] = await Promise.all([
      supabase.from("bracket_rounds").select("round_number, name").eq("competition_id", comp.id).order("round_number"),
      supabase
        .from("bracket_slots")
        .select("match_index, round_id, position, competitor_a_id, competitor_b_id, winner_competitor_id, is_bye, status, event_id")
        .eq("competition_id", comp.id)
        .order("match_index"),
      supabase.from("competitors").select("id, name").eq("tenant_id", tenantId),
    ]);

    const nameById = new Map((competitors ?? []).map((c) => [c.id, c.name]));
    const roundNumberById = new Map<string, { number: number; name: string }>();
    // Map round_id → {number,name} by re-fetching rounds with ids.
    const { data: roundRows } = await supabase
      .from("bracket_rounds")
      .select("id, round_number, name")
      .eq("competition_id", comp.id);
    for (const r of roundRows ?? []) roundNumberById.set(r.id, { number: r.round_number, name: r.name });

    // Event id → slug for linking to matchup events.
    const eventSlugById = new Map((eventRows ?? []).map((e) => [e.id, e.slug]));

    const matches: BracketMatchView[] = (slots ?? []).map((sl) => {
      const round = roundNumberById.get(sl.round_id);
      return {
        matchIndex: sl.match_index,
        roundNumber: round?.number ?? 0,
        roundName: round?.name ?? "",
        position: sl.position,
        competitorA: sl.competitor_a_id ? nameById.get(sl.competitor_a_id) ?? null : null,
        competitorB: sl.competitor_b_id ? nameById.get(sl.competitor_b_id) ?? null : null,
        winner: sl.winner_competitor_id ? nameById.get(sl.winner_competitor_id) ?? null : null,
        isBye: sl.is_bye,
        eventSlug: sl.event_id ? eventSlugById.get(sl.event_id) ?? null : null,
        status: sl.status,
      };
    });

    bracket = {
      rounds: (rounds ?? []).map((r) => ({ number: r.round_number, name: r.name })),
      matches,
    };
  }

  const creator = Array.isArray(comp.creators) ? comp.creators[0] : comp.creators;

  return {
    id: comp.id,
    title: comp.title,
    slug: comp.slug,
    description: comp.description,
    type: comp.type as CompetitionType,
    status: comp.status as CompetitionStatus,
    startsAt: comp.starts_at,
    endsAt: comp.ends_at,
    creator: creator?.display_name ?? null,
    events,
    bracket,
  };
}

export type CompetitionListItem = {
  id: string;
  title: string;
  slug: string;
  type: CompetitionType;
  status: CompetitionStatus;
};

export async function listCompetitions(tenantId: string): Promise<CompetitionListItem[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("competitions")
    .select("id, title, slug, type, status")
    .eq("tenant_id", tenantId)
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    type: c.type as CompetitionType,
    status: c.status as CompetitionStatus,
  }));
}
