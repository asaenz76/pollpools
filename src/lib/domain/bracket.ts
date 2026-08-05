/**
 * Single-elimination bracket generation & advancement (spec §8).
 *
 * Pure, deterministic logic — no I/O. It computes the bracket STRUCTURE (rounds,
 * matchups, byes) and resolves advancement from match winners. Advancement is
 * expressed by RELATIONSHIP (`sourceMatchIndex`) — a later matchup references the
 * winner of an earlier one; competitors are never duplicated between rounds.
 *
 * V1 is single-elimination only (no double elimination). Byes are supported when
 * the competitor count is not a power of two: the extra top seeds get a bye and
 * advance without a played matchup.
 */

export type BracketSlot = {
  /** Seeded/known competitor, or null when fed by a source matchup. */
  competitorId: string | null;
  /** Global index of the matchup whose winner fills this slot, or null. */
  sourceMatchIndex: number | null;
};

export type BracketMatch = {
  /** Stable global index across the whole bracket (round 1 first). */
  index: number;
  round: number;
  /** Position within the round (0-based). */
  position: number;
  slotA: BracketSlot;
  slotB: BracketSlot;
  /** True when one side is empty: the present competitor advances unplayed. */
  isBye: boolean;
  byeCompetitorId: string | null;
};

export type Bracket = {
  size: number; // power of two >= competitor count
  rounds: number; // log2(size)
  matches: BracketMatch[];
};

/** Smallest power of two >= n (min 2). */
export function nextPowerOfTwo(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard bracket seed order for a power-of-two size. Each first-round pair
 * sums to size+1 (1 vs N, 2 vs N-1, …) so top seeds meet as late as possible.
 */
export function seedOrder(size: number): number[] {
  const rounds = Math.log2(size);
  if (!Number.isInteger(rounds)) throw new Error("size must be a power of two");
  let order = [1, 2];
  for (let r = 1; r < rounds; r++) {
    const sum = 2 ** (r + 1) + 1;
    const next: number[] = [];
    for (const x of order) {
      next.push(x, sum - x);
    }
    order = next;
  }
  return order;
}

/**
 * Generate a single-elimination bracket. `competitors` is seed-ordered (index 0
 * is the #1 seed). For random seeding, shuffle before calling.
 */
export function generateBracket(competitors: readonly string[]): Bracket {
  const count = competitors.length;
  if (count < 2) throw new Error("A bracket needs at least 2 competitors");

  const size = nextPowerOfTwo(count);
  const totalRounds = Math.log2(size);
  const order = seedOrder(size);
  const seedToCompetitor = (seed: number): string | null =>
    seed <= count ? (competitors[seed - 1] ?? null) : null;

  const matches: BracketMatch[] = [];
  let globalIndex = 0;

  // Round 1: seeded pairs from the seed order.
  let previousRound: BracketMatch[] = [];
  for (let m = 0; m < size / 2; m++) {
    const compA = seedToCompetitor(order[2 * m]!);
    const compB = seedToCompetitor(order[2 * m + 1]!);
    const isBye = (compA === null) !== (compB === null);
    const match: BracketMatch = {
      index: globalIndex++,
      round: 1,
      position: m,
      slotA: { competitorId: compA, sourceMatchIndex: null },
      slotB: { competitorId: compB, sourceMatchIndex: null },
      isBye,
      byeCompetitorId: isBye ? (compA ?? compB) : null,
    };
    matches.push(match);
    previousRound.push(match);
  }

  // Later rounds: each matchup is fed by two matchups of the previous round.
  for (let round = 2; round <= totalRounds; round++) {
    const current: BracketMatch[] = [];
    for (let m = 0; m < previousRound.length / 2; m++) {
      const srcA = previousRound[2 * m]!.index;
      const srcB = previousRound[2 * m + 1]!.index;
      const match: BracketMatch = {
        index: globalIndex++,
        round,
        position: m,
        slotA: { competitorId: null, sourceMatchIndex: srcA },
        slotB: { competitorId: null, sourceMatchIndex: srcB },
        isBye: false,
        byeCompetitorId: null,
      };
      matches.push(match);
      current.push(match);
    }
    previousRound = current;
  }

  return { size, rounds: totalRounds, matches };
}

export type ResolvedMatch = {
  index: number;
  round: number;
  position: number;
  competitorA: string | null;
  competitorB: string | null;
  winner: string | null;
  /** Both competitors known, not a bye, not yet decided → playable now. */
  ready: boolean;
};

/**
 * Resolve advancement given the winners of decided matchups. Byes resolve
 * automatically (their present competitor advances). Returns each matchup with
 * its effective competitors, winner, and whether it is ready to be played.
 */
export function resolveBracket(
  bracket: Bracket,
  winners: ReadonlyMap<number, string>,
): ResolvedMatch[] {
  const byIndex = new Map(bracket.matches.map((m) => [m.index, m]));

  const winnerOf = (index: number): string | null => {
    const match = byIndex.get(index);
    if (!match) return null;
    if (match.isBye) return match.byeCompetitorId;
    return winners.get(index) ?? null;
  };

  const slotCompetitor = (slot: BracketSlot): string | null =>
    slot.competitorId ?? (slot.sourceMatchIndex !== null ? winnerOf(slot.sourceMatchIndex) : null);

  return bracket.matches.map((m) => {
    const competitorA = slotCompetitor(m.slotA);
    const competitorB = slotCompetitor(m.slotB);
    const winner = m.isBye ? m.byeCompetitorId : winners.get(m.index) ?? null;
    const ready = !m.isBye && competitorA !== null && competitorB !== null && winner === null;
    return { index: m.index, round: m.round, position: m.position, competitorA, competitorB, winner, ready };
  });
}

/** The single final matchup (highest round). */
export function finalMatch(bracket: Bracket): BracketMatch {
  return bracket.matches.reduce((a, b) => (b.round > a.round ? b : a));
}

/** Human name for a round given how many competitors enter it. */
export function roundName(entering: number): string {
  switch (entering) {
    case 2:
      return "Final";
    case 4:
      return "Semifinals";
    case 8:
      return "Quarterfinals";
    default:
      return `Round of ${entering}`;
  }
}

export type BracketStructure = {
  rounds: { round_number: number; name: string; size: number }[];
  matches: {
    match_index: number;
    round_number: number;
    position: number;
    competitor_a_id: string | null;
    competitor_b_id: string | null;
    source_a_index: number | null;
    source_b_index: number | null;
    is_bye: boolean;
    bye_competitor_id: string | null;
  }[];
};

/** Serialize a bracket into the JSON contract consumed by `create_bracket`. */
export function bracketToStructure(bracket: Bracket): BracketStructure {
  const rounds: BracketStructure["rounds"] = [];
  for (let r = 1; r <= bracket.rounds; r++) {
    const entering = bracket.size / 2 ** (r - 1);
    rounds.push({ round_number: r, name: roundName(entering), size: entering });
  }
  return {
    rounds,
    matches: bracket.matches.map((m) => ({
      match_index: m.index,
      round_number: m.round,
      position: m.position,
      competitor_a_id: m.slotA.competitorId,
      competitor_b_id: m.slotB.competitorId,
      source_a_index: m.slotA.sourceMatchIndex,
      source_b_index: m.slotB.sourceMatchIndex,
      is_bye: m.isBye,
      bye_competitor_id: m.byeCompetitorId,
    })),
  };
}
