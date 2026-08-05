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
