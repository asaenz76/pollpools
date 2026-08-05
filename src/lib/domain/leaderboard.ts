/**
 * Leaderboard ranking (spec §16).
 *
 * Ranking order:
 *   1. total points (desc)
 *   2. accuracy (desc)
 *   3. total correct predictions (desc)
 *   4. earliest time reaching the score (asc)
 *   5. stable user id (asc)
 *
 * A minimum number of graded predictions is required before a user is ranked;
 * users below the threshold are returned separately (still visible, unranked).
 */

import { MINIMUM_RANKED_PREDICTIONS } from "@/lib/constants";

export type LeaderboardStat = {
  userId: string;
  totalPoints: number;
  correct: number;
  incorrect: number;
  /** ms timestamp used for the "earliest to reach the score" tiebreak. */
  reachedAt: number;
};

export type RankedEntry = LeaderboardStat & { rank: number; accuracy: number };

export type Leaderboard = {
  ranked: RankedEntry[];
  unranked: (LeaderboardStat & { accuracy: number })[];
};

export function accuracyOf(stat: { correct: number; incorrect: number }): number {
  const graded = stat.correct + stat.incorrect;
  return graded === 0 ? 0 : stat.correct / graded;
}

function compare(a: LeaderboardStat, b: LeaderboardStat): number {
  if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  const accA = accuracyOf(a);
  const accB = accuracyOf(b);
  if (accA !== accB) return accB - accA;
  if (a.correct !== b.correct) return b.correct - a.correct;
  if (a.reachedAt !== b.reachedAt) return a.reachedAt - b.reachedAt;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

/**
 * Rank a set of user stats. Users with fewer than `minRanked` graded predictions
 * are separated into `unranked`. Ranks are dense 1..n over the ranked set.
 */
export function rankLeaderboard(
  stats: readonly LeaderboardStat[],
  minRanked: number = MINIMUM_RANKED_PREDICTIONS,
): Leaderboard {
  const eligible: LeaderboardStat[] = [];
  const below: LeaderboardStat[] = [];
  for (const s of stats) {
    if (s.correct + s.incorrect >= minRanked) eligible.push(s);
    else below.push(s);
  }

  const ranked = [...eligible].sort(compare).map((s, i) => ({ ...s, rank: i + 1, accuracy: accuracyOf(s) }));
  const unranked = [...below].sort(compare).map((s) => ({ ...s, accuracy: accuracyOf(s) }));

  return { ranked, unranked };
}
