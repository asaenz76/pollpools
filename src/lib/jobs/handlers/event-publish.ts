import { registerJobHandler, type SystemJob } from "../worker";
import { JOB_TYPES, NOTIFICATION_FANOUT_BATCH_SIZE } from "../types";

/**
 * Event-publication projections (§5F, F-19). Publishing an event enqueues these
 * in the same transaction; there is no synchronous per-follower loop.
 *  - feed   → one canonical feed activity (idempotent).
 *  - fanout → batched per-follower notification fan-out, cursor-tracked in
 *             notification_fanouts, resumable on retry, idempotent per recipient.
 */
registerJobHandler(JOB_TYPES.EVENT_PUBLISH_FEED, async (job: SystemJob, { admin }) => {
  const p = job.payload as { tenant_id: string; event_id: string };
  const { error } = await admin.rpc("project_event_publish_feed", { p_tenant: p.tenant_id, p_event: p.event_id } as never);
  if (error) throw new Error(`project_event_publish_feed: ${error.message}`);
});

registerJobHandler(JOB_TYPES.EVENT_PUBLISH_FANOUT, async (job: SystemJob, { admin }) => {
  const p = job.payload as { fanout_dedup: string };
  const { data: fo } = await admin.from("notification_fanouts").select("id, status").eq("dedup_key", p.fanout_dedup).maybeSingle();
  if (!fo) return; // fan-out state missing (nothing to do)
  if (["completed", "canceled", "superseded"].includes(fo.status)) return;

  // Process bounded batches until the fan-out is complete. Each batch is its own
  // transaction (no large lock); a failure retries and resumes from the cursor.
  let status = "more";
  let guard = 0;
  while (status === "more" && guard++ < 1_000_000) {
    const { data, error } = await admin.rpc("process_event_publish_fanout", { p_fanout_id: fo.id, p_batch_size: NOTIFICATION_FANOUT_BATCH_SIZE } as never);
    if (error) throw new Error(`process_event_publish_fanout: ${error.message}`);
    status = data as unknown as string;
  }
});
