/** Platform-wide constants. Tenant/competition overrides layer on top later. */

/** Minimum graded predictions before accuracy can drive a ranked position. */
export const MINIMUM_RANKED_PREDICTIONS = 5;

/** Default scoring (V1): the only rule implemented, though the structure is configurable. */
export const DEFAULT_SCORING = {
  correctPoints: 1,
  incorrectPoints: 0,
  voidPoints: 0,
  canceledPoints: 0,
  noPredictionPoints: 0,
} as const;

/** Development tenant route prefix, e.g. /t/marbles. */
export const TENANT_ROUTE_PREFIX = "/t";

/** Threshold below which sentiment may be shown as "Picked by X of Y". */
export const SMALL_PARTICIPATION_THRESHOLD = 10;

/**
 * Bracket competitor bounds. A knockout supports 2–32 competitors; the creator
 * selects how many, and byes fill out the next power of two when needed.
 */
export const MIN_BRACKET_COMPETITORS = 2;
export const MAX_BRACKET_COMPETITORS = 32;

/** Competitor Draft (Phase 4.5). */
export const DRAFT_RESERVATION_MINUTES = 10;

/**
 * Product rule kept visible on every draft surface: drafting is optional and
 * never gates free predictions. Use this exact copy so messaging stays consistent.
 */
export const DRAFT_OPTIONAL_NOTICE =
  "Drafting a competitor is optional. Everyone can still make free predictions.";

/** Shown for paid drafts to make clear the fee buys access, not an advantage. */
export const DRAFT_PAID_NOTICE =
  "The draft fee gives you one competitor for this competition. It does not affect prediction scoring or improve your chances in free predictions.";
