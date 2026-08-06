import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import type { LeaderboardScope } from "@/types/enums";

export type LeaderboardRow = {
  userId: string;
  displayName: string;
  handle: string | null;
  rank: number | null;
  totalPoints: number;
  correctPredictions: number;
  accuracy: number;
  ranked: boolean;
};

export type GlobalLeaderboard = {
  ranked: LeaderboardRow[];
  unranked: LeaderboardRow[];
};

/**
 * Read a materialized leaderboard for an EXPLICIT scope (§16, §5D). Ranking is
 * computed at settlement time by the scope's refresh, so browsing is a cheap read
 * — never a full recompute. The scope is always explicit: this lower-level reader
 * never silently defaults to global (the UI's `getGlobalLeaderboard` wrapper is
 * what intentionally requests the global scope).
 */
export async function getLeaderboard(
  tenantId: string,
  scope: LeaderboardScope,
  scopeId: string | null = null,
): Promise<GlobalLeaderboard> {
  const supabase = await createServerSupabase();

  let query = supabase
    .from("leaderboard_snapshots")
    .select("user_id, rank, total_points, correct_predictions, accuracy, ranked")
    .eq("tenant_id", tenantId)
    .eq("scope", scope)
    .eq("period", "all_time");
  query = scopeId === null ? query.is("scope_id", null) : query.eq("scope_id", scopeId);

  const { data: rows } = await query
    .order("ranked", { ascending: false })
    .order("rank", { ascending: true, nullsFirst: false })
    .order("total_points", { ascending: false })
    .limit(200);

  const userIds = (rows ?? []).map((r) => r.user_id);
  const nameByUser = new Map<string, { displayName: string; handle: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, handle")
      .eq("tenant_id", tenantId)
      .in("user_id", userIds);
    for (const p of profiles ?? []) {
      nameByUser.set(p.user_id, { displayName: p.display_name, handle: p.handle });
    }
  }

  const map = (r: NonNullable<typeof rows>[number]): LeaderboardRow => {
    const profile = nameByUser.get(r.user_id);
    return {
      userId: r.user_id,
      displayName: profile?.displayName ?? "Member",
      handle: profile?.handle ?? null,
      rank: r.rank,
      totalPoints: r.total_points,
      correctPredictions: r.correct_predictions,
      accuracy: Number(r.accuracy),
      ranked: r.ranked,
    };
  };

  return {
    ranked: (rows ?? []).filter((r) => r.ranked).map(map),
    unranked: (rows ?? []).filter((r) => !r.ranked).map(map),
  };
}

/** The tenant-global leaderboard — the UI's intentional global-scope request. */
export function getGlobalLeaderboard(tenantId: string): Promise<GlobalLeaderboard> {
  return getLeaderboard(tenantId, "global", null);
}
