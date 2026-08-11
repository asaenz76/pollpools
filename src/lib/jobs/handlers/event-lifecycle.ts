import { registerJobHandler, type JobContext, type JobOutcome, type SystemJob } from "../worker";
import { JOB_TYPES } from "../types";

/**
 * Event-lifecycle projection handlers (EVT). Currently one job: the "Event
 * canceled" participant fan-out, enqueued transactionally by cancel_event (0069)
 * and delivered here via app.emit_notification (deduped per event+user, so a
 * retried or re-enqueued job never double-sends). project_event_cancel_notifications
 * returns false when the event is no longer canceled (a stale job) → skip.
 */
type CancelPayload = { tenant_id: string; event_id: string };

registerJobHandler(JOB_TYPES.EVENT_CANCEL, async (job: SystemJob, { admin }: JobContext): Promise<JobOutcome> => {
  const p = job.payload as CancelPayload;
  const { data, error } = await admin.rpc("project_event_cancel_notifications", { p_event: p.event_id } as never);
  if (error) throw new Error(`project_event_cancel_notifications: ${error.message}`);
  if (data !== true) return { skipped: "event no longer canceled" };
});
