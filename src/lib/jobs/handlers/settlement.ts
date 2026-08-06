import { registerJobHandler, type JobContext, type JobOutcome, type SystemJob } from "../worker";
import { JOB_TYPES, type ProjectionPayload } from "../types";

/**
 * Settlement projection handlers (§5B–§5E). Each calls its version-aware SQL
 * projection function. Two return conventions:
 *  - boolean  (user_stats, feed, notifications): true = applied, false = stale.
 *  - status   (leaderboard, draft, achievements): 'applied' | 'stale' | 'defer'
 *             | 'blocked'. `defer` = prerequisites unmet (retry, no failure-budget
 *             cost); `blocked` = a required job dead-lettered / a required input is
 *             missing → fail visibly, never publish stale/degraded data.
 */
function payload(job: SystemJob): ProjectionPayload {
  return job.payload as ProjectionPayload;
}

async function booleanProjection(
  { admin }: JobContext,
  fn: "project_user_stats" | "project_settlement_feed" | "project_settlement_notifications",
  args: Record<string, unknown>,
  version: number,
): Promise<JobOutcome> {
  const { data, error } = await admin.rpc(fn, args as never);
  if (error) throw new Error(`${fn}: ${error.message}`);
  if (data !== true) return { skipped: `grading version ${version} no longer active` };
}

/** Map a projection status function's result to a worker outcome. */
async function statusProjection(
  { admin }: JobContext,
  fn: "project_leaderboard_scope" | "project_draft_standings" | "project_achievements",
  args: Record<string, unknown>,
  ctx: { version: number; settlementId: string; label: string },
): Promise<JobOutcome> {
  const { data, error } = await admin.rpc(fn, args as never);
  if (error) throw new Error(`${fn}: ${error.message}`);
  switch (data as unknown as string) {
    case "stale":
      return { skipped: `grading version ${ctx.version} no longer active` };
    case "defer":
      return { defer: `awaiting prerequisite jobs for settlement ${ctx.settlementId}` };
    case "blocked":
      throw new Error(`${ctx.label} blocked for settlement ${ctx.settlementId} (see prerequisites / recorded result)`);
    default:
      return; // 'applied'
  }
}

registerJobHandler(JOB_TYPES.RECOMPUTE_USER_STATS, (job, ctx) => {
  const p = payload(job);
  return booleanProjection(ctx, "project_user_stats", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version, p_user: p.user_id, p_settlement_id: p.settlement_id }, p.grading_version);
});

registerJobHandler(JOB_TYPES.EVALUATE_ACHIEVEMENTS, (job, ctx) => {
  const p = payload(job);
  return statusProjection(ctx, "project_achievements", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version, p_user: p.user_id, p_settlement_id: p.settlement_id }, { version: p.grading_version, settlementId: p.settlement_id, label: "achievements" });
});

registerJobHandler(JOB_TYPES.REFRESH_LEADERBOARD, (job, ctx) => {
  const p = payload(job);
  return statusProjection(ctx, "project_leaderboard_scope", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version, p_settlement_id: p.settlement_id, p_scope: p.scope, p_scope_id: p.scope_id ?? null }, { version: p.grading_version, settlementId: p.settlement_id, label: "leaderboard" });
});

registerJobHandler(JOB_TYPES.REFRESH_DRAFT_STANDINGS, (job, ctx) => {
  const p = payload(job);
  return statusProjection(ctx, "project_draft_standings", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version, p_settlement_id: p.settlement_id }, { version: p.grading_version, settlementId: p.settlement_id, label: "draft standings" });
});

registerJobHandler(JOB_TYPES.SETTLEMENT_FEED, (job, ctx) => {
  const p = payload(job);
  return booleanProjection(ctx, "project_settlement_feed", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version }, p.grading_version);
});

registerJobHandler(JOB_TYPES.NOTIFY_SETTLEMENT, (job, ctx) => {
  const p = payload(job);
  return booleanProjection(ctx, "project_settlement_notifications", { p_tenant: p.tenant_id, p_event: p.event_id, p_version: p.grading_version }, p.grading_version);
});
