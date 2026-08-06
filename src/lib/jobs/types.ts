/** Projection job-type identifiers. Must match the `job_type` strings enqueued
 *  by `app.enqueue_settlement_projections` (0036) and `app.on_event_published` (0042). */
export const JOB_TYPES = {
  RECOMPUTE_USER_STATS: "projection.user_stats",
  EVALUATE_ACHIEVEMENTS: "projection.achievements",
  REFRESH_LEADERBOARD: "projection.leaderboard",
  REFRESH_DRAFT_STANDINGS: "projection.draft_standings",
  SETTLEMENT_FEED: "projection.feed",
  NOTIFY_SETTLEMENT: "projection.notify_settlement",
  EVENT_PUBLISH_FEED: "projection.event_publish_feed",
  EVENT_PUBLISH_FANOUT: "projection.event_publish_fanout",
} as const;

/** Bounded batch size for per-follower notification fan-out (configurable). */
export const NOTIFICATION_FANOUT_BATCH_SIZE = 100;

export type ProjectionPayload = {
  tenant_id: string;
  event_id: string;
  grading_version: number;
  settlement_id: string;
  user_id?: string;
  competition_id?: string | null;
  creator_id?: string | null;
  /** Leaderboard jobs only: which scope this job refreshes. */
  scope?: "global" | "creator" | "competition" | "season";
  scope_id?: string | null;
};
