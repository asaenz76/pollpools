import type { MarketType } from "@/types/enums";

/**
 * Market grading strategy (§3).
 *
 * Settlement must not assume a single-winner market. A `MarketGrader` resolves,
 * for its market type, the WINNING OUTCOME — which option(s) won — from a
 * normalized resolution input. The reversible SQL settlement then grades each
 * prediction against that option set and applies scoring. Nothing else in the
 * codebase switches on market type: callers ask the registry for a grader.
 */
export type MarketOptionRef = {
  id: string;
  /** Competitor this option maps to, if any (null for non-competitor options). */
  competitorId: string | null;
};

/**
 * A market-type-agnostic resolution. Each grader reads only the fields relevant
 * to its type; new fields are added when a grader that consumes them is added.
 */
export type MarketResolution = {
  /** SINGLE_CHOICE_WINNER: the winning competitor. */
  winningCompetitorId?: string | null;
};

export interface MarketGrader {
  readonly marketType: MarketType;
  /** The winning option ids for this market given the resolution (empty = none). */
  resolveWinningOptionIds(options: MarketOptionRef[], resolution: MarketResolution): string[];
}

export class UnsupportedMarketTypeError extends Error {
  constructor(public readonly marketType: string) {
    super(`No MarketGrader is registered for market type "${marketType}"`);
    this.name = "UnsupportedMarketTypeError";
  }
}
