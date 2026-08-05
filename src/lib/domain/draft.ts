/**
 * Competitor Draft — pure logic (spec §9, §10). Draft standings are computed
 * from the drafted competitor's finishing results and are ALWAYS separate from
 * prediction scoring. These helpers mirror the SQL and exist for unit testing.
 */

export type PositionPoints = Record<string, number>;

/** Points a competitor earns for a finishing position under a scoring config. */
export function pointsForPosition(config: PositionPoints, position: number | null): number {
  if (position == null) return 0;
  return config[String(position)] ?? 0;
}

/** Sum a competitor's points across a set of finishing positions. */
export function competitorPoints(config: PositionPoints, positions: readonly (number | null)[]): number {
  return positions.reduce((sum: number, p) => sum + pointsForPosition(config, p), 0);
}

export type DraftStanding = {
  assignmentId: string;
  userId: string;
  competitorId: string;
  competitionPoints: number;
  wins: number;
  podiums: number;
  bestPosition: number | null;
  /** ms timestamp of draft confirmation (earlier wins ties). */
  confirmedAt: number;
};

export type RankedStanding = DraftStanding & { rank: number };

/**
 * Rank draft standings (spec §10 tie-breakers):
 *   points → wins → podiums → best finishing position → earlier confirmation → id.
 */
export function rankDraftStandings(standings: readonly DraftStanding[]): RankedStanding[] {
  const sorted = [...standings].sort((a, b) => {
    if (a.competitionPoints !== b.competitionPoints) return b.competitionPoints - a.competitionPoints;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.podiums !== b.podiums) return b.podiums - a.podiums;
    const bestA = a.bestPosition ?? Number.MAX_SAFE_INTEGER;
    const bestB = b.bestPosition ?? Number.MAX_SAFE_INTEGER;
    if (bestA !== bestB) return bestA - bestB;
    if (a.confirmedAt !== b.confirmedAt) return a.confirmedAt - b.confirmedAt;
    return a.assignmentId < b.assignmentId ? -1 : a.assignmentId > b.assignmentId ? 1 : 0;
  });
  return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
}

export type DraftWindow = {
  status: "draft" | "scheduled" | "open" | "closed" | "active" | "completed" | "canceled";
  opensAt: Date | string | null;
  closesAt: Date | string | null;
};

function toMs(value: Date | string | null): number | null {
  if (value == null) return null;
  return (value instanceof Date ? value : new Date(value)).getTime();
}

/** Whether a user may draft right now (mirrors the DB gate in draft_competitor). */
export function isDraftOpen(window: DraftWindow, now: Date): boolean {
  if (window.status !== "open" && window.status !== "active") return false;
  const opens = toMs(window.opensAt);
  const closes = toMs(window.closesAt);
  const nowMs = now.getTime();
  if (opens != null && nowMs < opens) return false;
  if (closes != null && nowMs >= closes) return false;
  return true;
}
