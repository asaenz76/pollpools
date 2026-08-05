/**
 * Scoring (spec §14). V1 implements only the default rule (correct = 1 point,
 * everything else = 0), but the rule is a typed structure so per-tenant /
 * per-competition rules can be added later without touching call sites.
 *
 * These pure helpers mirror the grading done inside the settlement function and
 * exist for clarity + unit testing.
 */

export type ScoringRule = {
  correct: number;
  incorrect: number;
  void: number;
  canceled: number;
  noPrediction: number;
};

export const DEFAULT_SCORING_RULE: ScoringRule = {
  correct: 1,
  incorrect: 0,
  void: 0,
  canceled: 0,
  noPrediction: 0,
};

/** How an event resolved. Void/canceled produce no points and no streak effect. */
export type EventResolution = "settled" | "voided" | "canceled";

/** The graded outcome of a single prediction. */
export type GradeOutcome = "correct" | "incorrect" | "void";

/** Grade one prediction against the winning option and the event resolution. */
export function gradePrediction(
  pickedOptionId: string,
  winningOptionId: string | null,
  resolution: EventResolution,
): GradeOutcome {
  if (resolution !== "settled" || winningOptionId === null) return "void";
  return pickedOptionId === winningOptionId ? "correct" : "incorrect";
}

/** Points for a graded outcome under a scoring rule. */
export function pointsFor(outcome: GradeOutcome, rule: ScoringRule = DEFAULT_SCORING_RULE): number {
  switch (outcome) {
    case "correct":
      return rule.correct;
    case "incorrect":
      return rule.incorrect;
    case "void":
      return rule.void;
  }
}
