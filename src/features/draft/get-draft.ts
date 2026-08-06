import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { isDraftOpen } from "@/lib/domain/draft";
import type { DraftMode, DraftAccessType, DraftStatus } from "@/types/enums";

export type RosterEntry = {
  competitorId: string;
  name: string;
  color: string | null;
  imageUrl: string | null;
  taken: boolean;
  drafters: number;
};

export type DraftStandingRow = {
  rank: number | null;
  userId: string;
  displayName: string;
  competitorName: string;
  competitionPoints: number;
  wins: number;
};

export type DraftPrize = {
  title: string;
  description: string | null;
  category: string;
  placementFrom: number | null;
  placementTo: number | null;
};

export type DraftSection = {
  enabled: boolean;
  mode: DraftMode;
  accessType: DraftAccessType;
  status: DraftStatus;
  opensAt: string | null;
  closesAt: string | null;
  feeMinorUnits: number | null;
  currencyCode: string | null;
  isOpen: boolean;
  roster: RosterEntry[];
  userAssignment: {
    assignmentId: string;
    competitorId: string;
    competitorName: string;
    status: string;
    paymentStatus: string;
  } | null;
  userRank: number | null;
  userPoints: number | null;
  standings: DraftStandingRow[];
  prizes: DraftPrize[];
  /** Billing product used to pay for a paid-draft reservation (null if none / free). */
  paidDraftProductId: string | null;
};

export async function getDraftSection(
  tenantId: string,
  competitionId: string,
  userId: string | null,
): Promise<DraftSection | null> {
  const supabase = await createServerSupabase();

  const { data: settings } = await supabase
    .from("competition_draft_settings")
    .select("is_enabled, mode, access_type, status, opens_at, closes_at, draft_fee_minor_units, currency_code")
    .eq("competition_id", competitionId)
    .maybeSingle();

  if (!settings || !settings.is_enabled) return null;

  const [{ data: rosterRows }, { data: standingRows }, { data: prizeRows }, competitorNames] = await Promise.all([
    supabase.rpc("draft_roster", { p_competition_id: competitionId }),
    supabase
      .from("draft_leaderboard_snapshots")
      .select("rank, user_id, competitor_id, competition_points, wins")
      .eq("competition_id", competitionId)
      .order("rank", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("competition_prizes")
      .select("title, description, category, placement_from, placement_to")
      .eq("competition_id", competitionId)
      .order("placement_from", { ascending: true, nullsFirst: false }),
    supabase.from("competitors").select("id, name").eq("tenant_id", tenantId),
  ]);

  const nameByCompetitor = new Map((competitorNames.data ?? []).map((c) => [c.id, c.name]));

  // Names for standings (public profiles).
  const standingUserIds = (standingRows ?? []).map((r) => r.user_id);
  const profileByUser = new Map<string, string>();
  if (standingUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("tenant_id", tenantId)
      .in("user_id", standingUserIds);
    for (const p of profiles ?? []) profileByUser.set(p.user_id, p.display_name);
  }

  let userAssignment: DraftSection["userAssignment"] = null;
  let userRank: number | null = null;
  let userPoints: number | null = null;
  if (userId) {
    const { data: asg } = await supabase
      .from("competitor_draft_assignments")
      .select("id, competitor_id, status, payment_status")
      .eq("competition_id", competitionId)
      .eq("user_id", userId)
      .not("status", "in", "(canceled,expired)")
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (asg) {
      userAssignment = {
        assignmentId: asg.id,
        competitorId: asg.competitor_id,
        competitorName: nameByCompetitor.get(asg.competitor_id) ?? "Your competitor",
        status: asg.status,
        paymentStatus: asg.payment_status,
      };
      const mine = (standingRows ?? []).find((r) => r.user_id === userId);
      userRank = mine?.rank ?? null;
      userPoints = mine?.competition_points ?? null;
    }
  }

  // The paid-draft billing product for this competition (single billing pipeline).
  let paidDraftProductId: string | null = null;
  if (settings.access_type === "paid") {
    const { data: product } = await supabase
      .from("billing_products")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("product_type", "paid_competitor_draft")
      .eq("competition_id", competitionId)
      .eq("status", "active")
      .maybeSingle();
    paidDraftProductId = product?.id ?? null;
  }

  return {
    enabled: true,
    mode: settings.mode as DraftMode,
    accessType: settings.access_type as DraftAccessType,
    status: settings.status as DraftStatus,
    opensAt: settings.opens_at,
    closesAt: settings.closes_at,
    feeMinorUnits: settings.draft_fee_minor_units,
    currencyCode: settings.currency_code,
    isOpen: isDraftOpen(
      { status: settings.status as DraftStatus, opensAt: settings.opens_at, closesAt: settings.closes_at },
      new Date(),
    ),
    roster: (rosterRows ?? []).map((r) => ({
      competitorId: r.competitor_id,
      name: r.name,
      color: r.color,
      imageUrl: r.image_url,
      taken: r.taken,
      drafters: Number(r.drafters),
    })),
    userAssignment,
    userRank,
    userPoints,
    standings: (standingRows ?? []).map((r) => ({
      rank: r.rank,
      userId: r.user_id,
      displayName: profileByUser.get(r.user_id) ?? "Member",
      competitorName: nameByCompetitor.get(r.competitor_id) ?? "—",
      competitionPoints: r.competition_points,
      wins: r.wins,
    })),
    prizes: (prizeRows ?? []).map((p) => ({
      title: p.title,
      description: p.description,
      category: p.category,
      placementFrom: p.placement_from,
      placementTo: p.placement_to,
    })),
    paidDraftProductId,
  };
}
