/**
 * Streaks (spec §15). Streaks are RECOMPUTED from a user's ordered graded history
 * rather than incremented in place — the spec explicitly forbids increment-only
 * updates that can't be safely reversed. Recomputing from the active grades makes
 * settlement, void, and regrade all trivially correct.
 *
 * Rules: a correct prediction extends the streak; an incorrect one resets it to
 * zero; void/canceled events are skipped entirely (no effect).
 */

import type { GradeOutcome } from "@/lib/domain/scoring";

export type GradedPrediction = {
  outcome: GradeOutcome;
  /** Chronological sort key (e.g. event start time, ms). */
  at: number;
};

export type StreakResult = { current: number; best: number };

/**
 * Fold an ordered history of graded predictions into current + best streak.
 * Input need not be pre-sorted; it is sorted by `at` ascending (stable).
 */
export function computeStreaks(history: readonly GradedPrediction[]): StreakResult {
  const ordered = [...history]
    .map((h, i) => ({ ...h, i }))
    .sort((a, b) => (a.at !== b.at ? a.at - b.at : a.i - b.i));

  let current = 0;
  let best = 0;
  for (const g of ordered) {
    if (g.outcome === "void") continue; // no effect on the streak
    if (g.outcome === "correct") {
      current += 1;
      if (current > best) best = current;
    } else {
      current = 0; // incorrect resets
    }
  }
  return { current, best };
}
