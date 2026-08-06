import { registerJobHandler, type JobContext, type JobOutcome, type SystemJob } from "../worker";
import { JOB_TYPES, type ProjectionPayload } from "../types";

/**
 * Settlement projection handlers (§5B). Each calls its version-aware SQL
 * projection function; a `false` return means the job's grading version is no
 * longer active (superseded by a regrade), so the job is superseded (skipped) —
 * an old version's job can never overwrite the active version's projections.
 */
type ProjectFn =
  | "project_user_stats"
  | "project_achievements"
  | "project_leaderboard"
  | "project_draft_standings"
  | "project_settlement_feed"
  | "project_settlement_notifications";

async function applyProjection(
  { admin }: JobContext,
  fn: ProjectFn,
  args: Record<string, unknown>,
  version: number,
): Promise<JobOutcome> {
  const { data, error } = await admin.rpc(fn, args as never);
  if (error) throw new Error(`${fn}: ${error.message}`);
  if (data !== true) return { skipped: `grading version ${version} no longer active` };
}

function payload(job: SystemJob): ProjectionPayload {
  return job.payload as ProjectionPayload;
}

registerJobHandler(JOB_TYPES.RECOMPUTE_USER_STATS, async (job, ctx) => {
  const p = payload(job);
  return applyProjection(ctx, "project_user_stats", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version, p_user: p.user_id }, p.grading_version);
});

registerJobHandler(JOB_TYPES.EVALUATE_ACHIEVEMENTS, async (job, ctx) => {
  const p = payload(job);
  return applyProjection(ctx, "project_achievements", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version, p_user: p.user_id }, p.grading_version);
});

registerJobHandler(JOB_TYPES.REFRESH_LEADERBOARD, async (job, ctx) => {
  const p = payload(job);
  return applyProjection(ctx, "project_leaderboard", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version }, p.grading_version);
});

registerJobHandler(JOB_TYPES.REFRESH_DRAFT_STANDINGS, async (job, ctx) => {
  const p = payload(job);
  return applyProjection(ctx, "project_draft_standings", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version }, p.grading_version);
});

registerJobHandler(JOB_TYPES.SETTLEMENT_FEED, async (job, ctx) => {
  const p = payload(job);
  return applyProjection(ctx, "project_settlement_feed", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version }, p.grading_version);
});

registerJobHandler(JOB_TYPES.NOTIFY_SETTLEMENT, async (job, ctx) => {
  const p = payload(job);
  return applyProjection(ctx, "project_settlement_notifications", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version }, p.grading_version);
});
