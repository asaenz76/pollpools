import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";

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
 * Read the materialized global leaderboard snapshot (spec §16). Ranking is
 * computed at settlement time by `refresh_global_leaderboard`, so browsing is a
 * cheap read — never a full recompute.
 */
export async function getGlobalLeaderboard(tenantId: string): Promise<GlobalLeaderboard> {
  const supabase = await createServerSupabase();

  const { data: rows } = await supabase
    .from("leaderboard_snapshots")
    .select("user_id, rank, total_points, correct_predictions, accuracy, ranked")
    .eq("tenant_id", tenantId)
    .eq("scope", "global")
    .eq("period", "all_time")
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
