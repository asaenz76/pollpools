/**
 * Durable projection jobs (§5). The worker contract lives in `worker.ts`; handler
 * modules register themselves here as they are added (statistics, leaderboards,
 * achievements, draft standings, notifications/feed). Importing this module wires
 * up every handler before the worker runs.
 */
export {
  runPendingJobs,
  drainJobs,
  registerJobHandler,
  registeredJobTypes,
  type SystemJob,
  type JobHandler,
  type JobContext,
  type JobOutcome,
  type WorkerResult,
} from "./worker";

// Job-type identifiers (kept in one place; handlers added in later sub-slices).
export const JOB_TYPES = {
  RECOMPUTE_USER_STATS: "projection.user_stats",
  REFRESH_LEADERBOARD: "projection.leaderboard",
  EVALUATE_ACHIEVEMENTS: "projection.achievements",
  REFRESH_DRAFT_STANDINGS: "projection.draft_standings",
  NOTIFY_SETTLEMENT: "projection.notify_settlement",
} as const;

// Handler registrations (populated as sub-slices C–F land):
// import "./handlers/user-stats";
