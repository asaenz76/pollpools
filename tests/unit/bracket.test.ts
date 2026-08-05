import { describe, it, expect } from "vitest";
import {
  nextPowerOfTwo,
  seedOrder,
  generateBracket,
  resolveBracket,
  finalMatch,
  type Bracket,
} from "@/lib/domain/bracket";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i + 1}`);

describe("nextPowerOfTwo", () => {
  it("rounds up to a power of two (min 2)", () => {
    expect(nextPowerOfTwo(2)).toBe(2);
    expect(nextPowerOfTwo(3)).toBe(4);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(8)).toBe(8);
    expect(nextPowerOfTwo(9)).toBe(16);
  });
});

describe("seedOrder", () => {
  it("produces the standard order", () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
  it("every first-round pair sums to size+1", () => {
    for (const size of [2, 4, 8, 16, 32]) {
      const order = seedOrder(size);
      for (let m = 0; m < size / 2; m++) {
        expect(order[2 * m]! + order[2 * m + 1]!).toBe(size + 1);
      }
    }
  });
});

describe("generateBracket", () => {
  it("rejects fewer than 2 competitors", () => {
    expect(() => generateBracket(ids(1))).toThrow();
  });

  it("builds a full power-of-two bracket (8)", () => {
    const b = generateBracket(ids(8));
    expect(b.size).toBe(8);
    expect(b.rounds).toBe(3);
    // 4 + 2 + 1 = 7 matches
    expect(b.matches).toHaveLength(7);
    expect(b.matches.filter((m) => m.round === 1)).toHaveLength(4);
    expect(b.matches.filter((m) => m.round === 3)).toHaveLength(1);
    // No byes in a full bracket.
    expect(b.matches.some((m) => m.isBye)).toBe(false);
    // #1 seed vs #8 seed in the first matchup.
    expect(b.matches[0]!.slotA.competitorId).toBe("c1");
    expect(b.matches[0]!.slotB.competitorId).toBe("c8");
  });

  it("assigns byes to top seeds when count is not a power of two (5)", () => {
    const b = generateBracket(ids(5)); // size 8
    expect(b.size).toBe(8);
    const byes = b.matches.filter((m) => m.isBye);
    // 8 - 5 = 3 byes, all in round 1, no bye-vs-bye.
    expect(byes).toHaveLength(3);
    expect(byes.every((m) => m.round === 1)).toBe(true);
    // The bye competitors are the seeds without a real opponent (c1, c2, c3).
    expect(new Set(byes.map((m) => m.byeCompetitorId))).toEqual(new Set(["c1", "c2", "c3"]));
  });

  it("supports up to 32 competitors (creator-selected count)", () => {
    const b16 = generateBracket(ids(16));
    expect(b16.size).toBe(16);
    expect(b16.rounds).toBe(4); // R16, QF, SF, Final
    expect(b16.matches).toHaveLength(15);

    const b32 = generateBracket(ids(32));
    expect(b32.size).toBe(32);
    expect(b32.rounds).toBe(5); // R32, R16, QF, SF, Final
    expect(b32.matches).toHaveLength(31);
    expect(b32.matches.some((m) => m.isBye)).toBe(false);

    // 20 competitors → size 32 with 12 byes, all in round 1.
    const b20 = generateBracket(ids(20));
    expect(b20.size).toBe(32);
    expect(b20.matches.filter((m) => m.isBye)).toHaveLength(12);
  });

  it("rejects more than 32 competitors", () => {
    expect(() => generateBracket(ids(33))).toThrow(/at most 32/);
  });

  it("rejects duplicate competitors", () => {
    expect(() => generateBracket(["a", "b", "a"])).toThrow(/unique/);
  });

  it("later-round slots reference previous matchups, not duplicated competitors", () => {
    const b = generateBracket(ids(4));
    const r2 = b.matches.find((m) => m.round === 2)!;
    expect(r2.slotA.competitorId).toBeNull();
    expect(r2.slotB.competitorId).toBeNull();
    expect(r2.slotA.sourceMatchIndex).toBe(0);
    expect(r2.slotB.sourceMatchIndex).toBe(1);
  });
});

describe("resolveBracket advancement", () => {
  it("advances winners into the next round", () => {
    const b = generateBracket(ids(4)); // 1v4, 2v3, then final
    const winners = new Map<number, string>([
      [0, "c1"], // c1 beats c4
      [1, "c2"], // c2 beats c3
    ]);
    const resolved = resolveBracket(b, winners);
    const final = resolved.find((m) => m.round === 2)!;
    expect(final.competitorA).toBe("c1");
    expect(final.competitorB).toBe("c2");
    expect(final.ready).toBe(true);
    expect(final.winner).toBeNull();
  });

  it("resolves byes automatically without a played match", () => {
    const b = generateBracket(ids(5)); // size 8, c1/c2/c3 have byes
    // Only the one real round-1 match (c4 vs c5) needs a winner.
    const realMatch = b.matches.find((m) => m.round === 1 && !m.isBye)!;
    const winners = new Map<number, string>([[realMatch.index, "c4"]]);
    const resolved = resolveBracket(b, winners);
    // Round 2 matchups should now have their competitors filled from byes/winner.
    const r2 = resolved.filter((m) => m.round === 2);
    for (const m of r2) {
      expect(m.competitorA).not.toBeNull();
      expect(m.competitorB).not.toBeNull();
      expect(m.ready).toBe(true);
    }
  });

  it("plays a full 4-bracket through to a champion", () => {
    const b = generateBracket(ids(4));
    const winners = new Map<number, string>([
      [0, "c1"],
      [1, "c3"],
    ]);
    const final = finalMatch(b);
    winners.set(final.index, "c3");
    const resolved = resolveBracket(b, winners);
    const champ = resolved.find((m) => m.index === final.index)!;
    expect(champ.competitorA).toBe("c1");
    expect(champ.competitorB).toBe("c3");
    expect(champ.winner).toBe("c3");
    expect(champ.ready).toBe(false); // already decided
  });

  it("a matchup is not ready until both feeders are decided", () => {
    const b = generateBracket(ids(4));
    const resolved = resolveBracket(b, new Map([[0, "c1"]])); // only one semifinal decided
    const final = resolved.find((m) => m.round === 2)!;
    expect(final.competitorA).toBe("c1");
    expect(final.competitorB).toBeNull();
    expect(final.ready).toBe(false);
  });
});
