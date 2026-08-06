import type { MarketGrader, MarketOptionRef, MarketResolution } from "./types";

/**
 * SINGLE_CHOICE_WINNER — the option mapped to the winning competitor wins.
 * This is the only market type with a creation path today; it is the reference
 * grader. Additional market types register alongside it (with their creation
 * flows) when there is a real consumer.
 */
export const singleChoiceWinnerGrader: MarketGrader = {
  marketType: "SINGLE_CHOICE_WINNER",
  resolveWinningOptionIds(options: MarketOptionRef[], resolution: MarketResolution): string[] {
    const winner = resolution.winningCompetitorId;
    if (!winner) return [];
    return options.filter((o) => o.competitorId === winner).map((o) => o.id);
  },
};
