import { describe, it, expect } from "vitest";
import {
  getMarketGrader,
  isMarketTypeSupported,
  supportedMarketTypes,
  UnsupportedMarketTypeError,
  type MarketOptionRef,
} from "@/lib/engine/graders";

const options: MarketOptionRef[] = [
  { id: "opt-red", competitorId: "red" },
  { id: "opt-blue", competitorId: "blue" },
  { id: "opt-green", competitorId: "green" },
];

describe("market grader registry", () => {
  it("supports SINGLE_CHOICE_WINNER and reports it", () => {
    expect(isMarketTypeSupported("SINGLE_CHOICE_WINNER")).toBe(true);
    expect(supportedMarketTypes()).toContain("SINGLE_CHOICE_WINNER");
  });

  it("raises (never silently voids) for an unregistered market type", () => {
    expect(isMarketTypeSupported("YES_NO")).toBe(false);
    expect(() => getMarketGrader("YES_NO")).toThrow(UnsupportedMarketTypeError);
  });
});

describe("single-choice-winner grader", () => {
  const grader = getMarketGrader("SINGLE_CHOICE_WINNER");

  it("resolves the option mapped to the winning competitor", () => {
    expect(grader.resolveWinningOptionIds(options, { winningCompetitorId: "blue" })).toEqual(["opt-blue"]);
  });

  it("resolves nothing when there is no winner or no matching option", () => {
    expect(grader.resolveWinningOptionIds(options, { winningCompetitorId: null })).toEqual([]);
    expect(grader.resolveWinningOptionIds(options, { winningCompetitorId: "nobody" })).toEqual([]);
  });
});
