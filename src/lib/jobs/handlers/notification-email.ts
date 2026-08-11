import { registerJobHandler, type JobContext, type JobOutcome, type SystemJob } from "../worker";
import { JOB_TYPES } from "../types";
import { deliverEmailNotification } from "@/lib/notifications/email-delivery";
import { applicationEmailTransportFromEnv } from "@/lib/providers/email";

/**
 * Email delivery handler (PL.3). Enqueued transactionally by the notifications
 * insert trigger (0072), deduped by notification id. Delivery is idempotent and
 * records state in `notification_deliveries`; a transport failure throws so the
 * durable queue (0035) retries and dead-letters. Runs independently of settlement.
 */
type Payload = { notification_id: string; tenant_id?: string };

registerJobHandler(JOB_TYPES.NOTIFICATION_EMAIL, async (job: SystemJob, { admin }: JobContext): Promise<JobOutcome> => {
  const p = job.payload as Payload;
  // Transport is resolved from server env at delivery time (Resend preferred). When
  // unconfigured the delivery marks itself skipped — never a fake send.
  const outcome = await deliverEmailNotification(admin, p.notification_id, applicationEmailTransportFromEnv());
  if (outcome !== "sent") return { skipped: `email ${outcome}` };
});
