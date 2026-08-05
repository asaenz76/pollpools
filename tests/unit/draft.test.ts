import { describe, it, expect } from "vitest";
import {
  pointsForPosition,
  competitorPoints,
  rankDraftStandings,
  isDraftOpen,
  type DraftStanding,
} from "@/lib/domain/draft";
import { MockPaymentAdapter, getPaymentAdapter } from "@/lib/payments/adapter";

const CONFIG = { "1": 10, "2": 8, "3": 6, "4": 5, "5": 4, "6": 3, "7": 2, "8": 1 };

describe("draft scoring", () => {
  it("maps finishing positions to points", () => {
    expect(pointsForPosition(CONFIG, 1)).toBe(10);
    expect(pointsForPosition(CONFIG, 8)).toBe(1);
    expect(pointsForPosition(CONFIG, 9)).toBe(0); // outside the map
    expect(pointsForPosition(CONFIG, null)).toBe(0);
  });
  it("sums points across events", () => {
    expect(competitorPoints(CONFIG, [1, 3, null, 2])).toBe(10 + 6 + 0 + 8);
  });
});

describe("draft standings ranking", () => {
  const s = (o: Partial<DraftStanding> & { assignmentId: string }): DraftStanding => ({
    userId: `u-${o.assignmentId}`,
    competitorId: `c-${o.assignmentId}`,
    competitionPoints: 0,
    wins: 0,
    podiums: 0,
    bestPosition: null,
    confirmedAt: 0,
    ...o,
  });

  it("orders by points then wins then podiums", () => {
    const r = rankDraftStandings([
      s({ assignmentId: "a", competitionPoints: 20, wins: 1 }),
      s({ assignmentId: "b", competitionPoints: 30, wins: 2 }),
      s({ assignmentId: "c", competitionPoints: 20, wins: 2 }),
    ]);
    expect(r.map((x) => x.assignmentId)).toEqual(["b", "c", "a"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it("breaks ties by best position, then earlier confirmation, then id", () => {
    const r = rankDraftStandings([
      s({ assignmentId: "late", competitionPoints: 10, wins: 0, podiums: 1, bestPosition: 2, confirmedAt: 200 }),
      s({ assignmentId: "early", competitionPoints: 10, wins: 0, podiums: 1, bestPosition: 2, confirmedAt: 100 }),
      s({ assignmentId: "better_finish", competitionPoints: 10, wins: 0, podiums: 1, bestPosition: 1, confirmedAt: 300 }),
    ]);
    expect(r.map((x) => x.assignmentId)).toEqual(["better_finish", "early", "late"]);
  });
});

describe("draft window", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  it("is open only when status open/active and within the window", () => {
    expect(isDraftOpen({ status: "open", opensAt: null, closesAt: null }, now)).toBe(true);
    expect(isDraftOpen({ status: "active", opensAt: null, closesAt: null }, now)).toBe(true);
    expect(isDraftOpen({ status: "draft", opensAt: null, closesAt: null }, now)).toBe(false);
    expect(isDraftOpen({ status: "closed", opensAt: null, closesAt: null }, now)).toBe(false);
  });
  it("respects opens_at / closes_at", () => {
    expect(isDraftOpen({ status: "open", opensAt: "2026-01-01T13:00:00Z", closesAt: null }, now)).toBe(false);
    expect(isDraftOpen({ status: "open", opensAt: null, closesAt: "2026-01-01T11:00:00Z" }, now)).toBe(false);
    expect(isDraftOpen({ status: "open", opensAt: "2026-01-01T11:00:00Z", closesAt: "2026-01-01T13:00:00Z" }, now)).toBe(true);
  });
});

describe("mock payment adapter", () => {
  it("verifies a correctly-signed webhook and rejects forgery/replay with a bad secret", () => {
    const adapter = getPaymentAdapter("mock");
    const ref = "mock_abc123";
    const secret = "s3cret";
    const sig = MockPaymentAdapter.sign(ref, secret);
    expect(adapter.verifyWebhook({ provider: "mock", reference: ref, status: "paid", signature: sig }, secret)).toBe(true);
    expect(adapter.verifyWebhook({ provider: "mock", reference: ref, status: "paid", signature: "mock_sig_bad" }, secret)).toBe(false);
    expect(adapter.verifyWebhook({ provider: "mock", reference: ref, status: "paid", signature: sig }, "wrong")).toBe(false);
  });
  it("rejects an unknown provider", () => {
    expect(() => getPaymentAdapter("stripe")).toThrow(/Unsupported/);
  });
});
