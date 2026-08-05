import "server-only";

import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import type { CreatorVerificationStatus, CompetitionType, EventStatus } from "@/types/enums";

export type MyCreator = {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  verificationStatus: CreatorVerificationStatus;
  settlementEnabled: boolean;
};

/** The signed-in user's creator profile in this tenant, or null. Memoized. */
export const getMyCreator = cache(async (tenantId: string): Promise<MyCreator | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("creators")
    .select("id, slug, display_name, description, verification_status, settlement_enabled")
    .eq("tenant_id", tenantId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    displayName: data.display_name,
    description: data.description,
    verificationStatus: data.verification_status as CreatorVerificationStatus,
    settlementEnabled: data.settlement_enabled,
  };
});

export type CreatorCompetitor = { id: string; name: string; color: string | null };
export type CreatorCompetition = { id: string; title: string; slug: string; type: CompetitionType; status: string };
export type CreatorEvent = { id: string; title: string; slug: string; status: EventStatus; startsAt: string | null };

export type CreatorWorkspace = {
  creator: MyCreator;
  competitors: CreatorCompetitor[];
  competitions: CreatorCompetition[];
  events: CreatorEvent[];
  stats: { competitions: number; events: number; predictions: number; competitors: number };
};

export async function getCreatorWorkspace(tenantId: string): Promise<CreatorWorkspace | null> {
  const creator = await getMyCreator(tenantId);
  if (!creator) return null;
  const supabase = await createServerSupabase();

  const [competitors, competitions, events] = await Promise.all([
    supabase.from("competitors").select("id, name, color").eq("creator_id", creator.id).order("name"),
    supabase.from("competitions").select("id, title, slug, type, status").eq("creator_id", creator.id).order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, slug, status, starts_at").eq("creator_id", creator.id).order("created_at", { ascending: false }).limit(50),
  ]);

  // Prediction volume across the creator's events (via their markets).
  let predictions = 0;
  const eventIds = (events.data ?? []).map((e) => e.id);
  if (eventIds.length) {
    const { data: markets } = await supabase.from("markets").select("id").in("event_id", eventIds);
    const marketIds = (markets ?? []).map((m) => m.id);
    if (marketIds.length) {
      const { count } = await supabase.from("predictions").select("*", { count: "exact", head: true }).in("market_id", marketIds);
      predictions = count ?? 0;
    }
  }

  return {
    creator,
    competitors: (competitors.data ?? []).map((c) => ({ id: c.id, name: c.name, color: c.color })),
    competitions: (competitions.data ?? []).map((c) => ({ id: c.id, title: c.title, slug: c.slug, type: c.type as CompetitionType, status: c.status })),
    events: (events.data ?? []).map((e) => ({ id: e.id, title: e.title, slug: e.slug, status: e.status as EventStatus, startsAt: e.starts_at })),
    stats: {
      competitions: (competitions.data ?? []).length,
      events: (events.data ?? []).length,
      predictions,
      competitors: (competitors.data ?? []).length,
    },
  };
}
