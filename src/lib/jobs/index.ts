/**
 * Durable projection jobs (§5). The worker contract lives in `worker.ts`; handler
 * modules register themselves as they are imported here, so importing this module
 * wires up every handler before the worker runs.
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

export { JOB_TYPES, NOTIFICATION_FANOUT_BATCH_SIZE, type ProjectionPayload } from "./types";

// Handler registrations (side-effect imports).
import "./handlers/settlement";
import "./handlers/event-publish";
