import { describe, it, expect } from "vitest";
import { gradePrediction, pointsFor, DEFAULT_SCORING_RULE } from "@/lib/domain/scoring";
import { computeStreaks, type GradedPrediction } from "@/lib/domain/streaks";
import { rankLeaderboard, accuracyOf, type LeaderboardStat } from "@/lib/domain/leaderboard";

describe("scoring", () => {
  it("grades correct/incorrect against the winning option", () => {
    expect(gradePrediction("o1", "o1", "settled")).toBe("correct");
    expect(gradePrediction("o1", "o2", "settled")).toBe("incorrect");
  });
  it("voids on void/canceled resolutions", () => {
    expect(gradePrediction("o1", "o1", "voided")).toBe("void");
    expect(gradePrediction("o1", "o1", "canceled")).toBe("void");
    expect(gradePrediction("o1", null, "settled")).toBe("void");
  });
  it("awards default points", () => {
    expect(pointsFor("correct")).toBe(1);
    expect(pointsFor("incorrect")).toBe(0);
    expect(pointsFor("void")).toBe(0);
    expect(pointsFor("correct", DEFAULT_SCORING_RULE)).toBe(1);
  });
});

describe("streaks", () => {
  const h = (outcomes: GradedPrediction["outcome"][]): GradedPrediction[] =>
    outcomes.map((outcome, at) => ({ outcome, at }));

  it("increments on correct, resets on incorrect", () => {
    expect(computeStreaks(h(["correct", "correct", "incorrect", "correct"]))).toEqual({ current: 1, best: 2 });
  });
  it("tracks best across the whole history", () => {
    expect(computeStreaks(h(["correct", "correct", "correct", "incorrect", "correct"]))).toEqual({ current: 1, best: 3 });
  });
  it("ignores void events entirely", () => {
    expect(computeStreaks(h(["correct", "void", "correct"]))).toEqual({ current: 2, best: 2 });
    expect(computeStreaks(h(["correct", "incorrect", "void"]))).toEqual({ current: 0, best: 1 });
  });
  it("is order-independent of input (sorts by `at`)", () => {
    const scrambled: GradedPrediction[] = [
      { outcome: "incorrect", at: 2 },
      { outcome: "correct", at: 0 },
      { outcome: "correct", at: 1 },
      { outcome: "correct", at: 3 },
    ];
    expect(computeStreaks(scrambled)).toEqual({ current: 1, best: 2 });
  });
  it("recompute reflects a regrade (correct→incorrect flips the streak)", () => {
    // Before regrade: three correct in a row.
    expect(computeStreaks(h(["correct", "correct", "correct"]))).toEqual({ current: 3, best: 3 });
    // After a regrade flips the middle result: streak recomputed from history.
    expect(computeStreaks(h(["correct", "incorrect", "correct"]))).toEqual({ current: 1, best: 1 });
  });
  it("empty history is zero", () => {
    expect(computeStreaks([])).toEqual({ current: 0, best: 0 });
  });
});

describe("leaderboard ranking", () => {
  const stat = (o: Partial<LeaderboardStat> & { userId: string }): LeaderboardStat => ({
    totalPoints: 0,
    correct: 0,
    incorrect: 0,
    reachedAt: 0,
    ...o,
  });

  it("separates users below the minimum ranked threshold", () => {
    const lb = rankLeaderboard(
      [
        stat({ userId: "a", totalPoints: 5, correct: 5, incorrect: 0 }),
        stat({ userId: "b", totalPoints: 2, correct: 2, incorrect: 0 }), // < 5 graded
      ],
      5,
    );
    expect(lb.ranked.map((r) => r.userId)).toEqual(["a"]);
    expect(lb.unranked.map((r) => r.userId)).toEqual(["b"]);
  });

  it("orders by points, then accuracy, then correct, then reachedAt, then id", () => {
    const lb = rankLeaderboard(
      [
        stat({ userId: "lowpoints", totalPoints: 3, correct: 3, incorrect: 3 }),
        stat({ userId: "tie_late", totalPoints: 6, correct: 6, incorrect: 2, reachedAt: 200 }),
        stat({ userId: "tie_early", totalPoints: 6, correct: 6, incorrect: 2, reachedAt: 100 }),
        stat({ userId: "higher_acc", totalPoints: 6, correct: 6, incorrect: 0 }),
      ],
      1,
    );
    expect(lb.ranked.map((r) => r.userId)).toEqual(["higher_acc", "tie_early", "tie_late", "lowpoints"]);
    expect(lb.ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("breaks a full tie by stable user id", () => {
    const lb = rankLeaderboard(
      [
        stat({ userId: "zeta", totalPoints: 4, correct: 4, incorrect: 1, reachedAt: 50 }),
        stat({ userId: "alpha", totalPoints: 4, correct: 4, incorrect: 1, reachedAt: 50 }),
      ],
      1,
    );
    expect(lb.ranked.map((r) => r.userId)).toEqual(["alpha", "zeta"]);
  });

  it("computes accuracy", () => {
    expect(accuracyOf({ correct: 3, incorrect: 1 })).toBe(0.75);
    expect(accuracyOf({ correct: 0, incorrect: 0 })).toBe(0);
  });
});
