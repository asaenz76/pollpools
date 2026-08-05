import { describe, it, expect } from "vitest";
import {
  computeSentiment,
  sentimentLabel,
  communityFavorite,
  type SentimentInput,
} from "@/lib/domain/sentiment";

const opts = (votes: number[]): SentimentInput[] =>
  votes.map((v, i) => ({ optionId: `o${i}`, label: `Option ${i}`, votes: v }));

const pct = (votes: number[]) => computeSentiment(opts(votes)).results.map((r) => r.percentage);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("computeSentiment", () => {
  it("reports no predictions when total is zero", () => {
    const s = computeSentiment(opts([0, 0, 0]));
    expect(s.hasPredictions).toBe(false);
    expect(s.total).toBe(0);
    expect(s.results.map((r) => r.percentage)).toEqual([0, 0, 0]);
  });

  it("matches the spec example (3/2/1 → 50/33/17)", () => {
    expect(pct([3, 2, 1])).toEqual([50, 33, 17]);
    expect(sum(pct([3, 2, 1]))).toBe(100);
  });

  it("single option gets 100%", () => {
    expect(pct([7])).toEqual([100]);
  });

  it("even two-way split", () => {
    expect(pct([1, 1])).toEqual([50, 50]);
  });

  it("three-way tie distributes leftover deterministically", () => {
    // 33.33 each → floors 33,33,33 (=99); one leftover to the earliest index.
    expect(pct([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sum(pct([1, 1, 1]))).toBe(100);
  });

  it("six-way split still totals 100", () => {
    const p = pct([1, 1, 1, 1, 1, 1]);
    expect(sum(p)).toBe(100);
    expect(p).toEqual([17, 17, 17, 17, 16, 16]);
  });

  it("includes zero-vote options at 0%", () => {
    expect(pct([5, 0, 0])).toEqual([100, 0, 0]);
  });

  it("always totals exactly 100 across many random distributions", () => {
    // Deterministic pseudo-inputs (no RNG) covering awkward remainders.
    const cases = [
      [1, 2, 3, 4],
      [10, 3, 3, 3],
      [7, 7, 7],
      [1, 1, 1, 1, 1, 1, 1],
      [2, 2, 2, 1],
      [100, 50, 25, 13, 7],
      [1, 0, 2, 0, 3],
    ];
    for (const c of cases) {
      expect(sum(pct(c))).toBe(100);
    }
  });

  it("preserves option order", () => {
    const s = computeSentiment(opts([1, 5, 2]));
    expect(s.results.map((r) => r.optionId)).toEqual(["o0", "o1", "o2"]);
  });
});

describe("sentimentLabel", () => {
  it("shows a percentage by default", () => {
    const s = computeSentiment(opts([3, 1]));
    expect(sentimentLabel(s.results[0]!, s.total)).toBe("Picked by 75%");
  });

  it("shows X of Y for small participation when enabled", () => {
    const s = computeSentiment(opts([3, 1]));
    expect(
      sentimentLabel(s.results[0]!, s.total, { smallParticipationDisplay: true, smallThreshold: 10 }),
    ).toBe("Picked by 3 of 4");
  });

  it("shows the no-sentiment message at zero", () => {
    const s = computeSentiment(opts([0, 0]));
    expect(sentimentLabel(s.results[0]!, s.total)).toBe("No community sentiment yet.");
  });
});

describe("communityFavorite", () => {
  it("returns the most-picked option", () => {
    const s = computeSentiment(opts([1, 5, 2]));
    expect(communityFavorite(s.results)?.optionId).toBe("o1");
  });
  it("returns null when there are no votes", () => {
    const s = computeSentiment(opts([0, 0]));
    expect(communityFavorite(s.results)).toBeNull();
  });
});
