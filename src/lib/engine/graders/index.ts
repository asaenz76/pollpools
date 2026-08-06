import type { MarketType } from "@/types/enums";
import type { MarketGrader } from "./types";
import { UnsupportedMarketTypeError } from "./types";
import { singleChoiceWinnerGrader } from "./single-choice-winner";

export type { MarketGrader, MarketOptionRef, MarketResolution } from "./types";
export { UnsupportedMarketTypeError } from "./types";

/**
 * The MarketGrader registry. Keyed by market type; a type with no grader is
 * explicitly unsupported (settlement raises, never silently voids). Additional
 * market types (YES_NO, MULTIPLE_CHOICE, …) register here together with their
 * creation flows when there is a real consumer.
 */
const REGISTRY: Partial<Record<MarketType, MarketGrader>> = {
  SINGLE_CHOICE_WINNER: singleChoiceWinnerGrader,
};

export function getMarketGrader(marketType: MarketType): MarketGrader {
  const grader = REGISTRY[marketType];
  if (!grader) throw new UnsupportedMarketTypeError(marketType);
  return grader;
}

export function isMarketTypeSupported(marketType: string): marketType is MarketType {
  return marketType in REGISTRY;
}

/** Market types the running engine can grade today. */
export function supportedMarketTypes(): MarketType[] {
  return Object.keys(REGISTRY) as MarketType[];
}
