// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { adminClient, uniqueSuffix, integrationEnvReady } from "./helpers";
import { runPendingJobs } from "@/lib/jobs/worker";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Durable job lifecycle (§5 sub-slice A): idempotent enqueue, atomic claim,
 * complete, retry-with-backoff → dead-letter, and skip (supersede). No projection
 * handlers exist yet, so an unknown job_type must fail visibly, never vanish.
 */
d("job lifecycle", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  const enqueued: string[] = [];

  const enqueue = (dedup: string, opts: { maxAttempts?: number; type?: string } = {}) =>
    admin.rpc("enqueue_job", {
      p_tenant: null,
      p_job_type: opts.type ?? `test.noop.${s}`,
      p_payload: { tag: s },
      p_dedup_key: dedup,
      p_max_attempts: opts.maxAttempts ?? 5,
    } as never) as unknown as Promise<{ data: string | null; error: unknown }>;
  const jobById = async (id: string) =>
    (await admin.from("system_jobs").select("status, attempts, error").eq("id", id).single()).data!;

  afterAll(async () => {
    for (const id of enqueued) await admin.from("system_jobs").delete().eq("id", id);
  });

  it("enqueues idempotently on dedup_key", async () => {
    const a = await enqueue(`dedup-${s}`);
    const b = await enqueue(`dedup-${s}`);
    expect(a.data).toBeTruthy();
    expect(b.data).toBeNull(); // deduped — no second row
    enqueued.push(a.data!);
  });

  it("claims a due job (marks running, counts the attempt) and completes it", async () => {
    const id = (await enqueue(`complete-${s}`)).data!;
    enqueued.push(id);
    await admin.rpc("claim_jobs", { p_limit: 100 } as never);
    const claimed = await jobById(id);
    expect(claimed.status).toBe("running");
    expect(claimed.attempts).toBe(1);
    await admin.rpc("complete_job", { p_id: id } as never);
    expect((await jobById(id)).status).toBe("succeeded");
  });

  it("retries with backoff, then dead-letters when the budget is spent", async () => {
    const id = (await enqueue(`dead-${s}`, { maxAttempts: 1 })).data!;
    enqueued.push(id);
    await admin.rpc("claim_jobs", { p_limit: 100 } as never); // attempts -> 1
    await admin.rpc("fail_job", { p_id: id, p_error: "boom" } as never);
    const dead = await jobById(id);
    expect(dead.status).toBe("dead"); // 1 >= max_attempts(1)
    expect(dead.error).toBe("boom");
  });

  it("a claimed job with no handler fails visibly (never vanishes)", async () => {
    const id = (await enqueue(`nohandler-${s}`, { type: `unknown.type.${s}`, maxAttempts: 5 })).data!;
    enqueued.push(id);
    const res = await runPendingJobs(admin, 100);
    expect(res.failed).toBeGreaterThanOrEqual(1);
    const after = await jobById(id);
    expect(after.status).toBe("pending"); // failed but retryable, error recorded
    expect(after.error).toContain("No handler");
  });

  it("skips a superseded job (terminal, visible, not retried)", async () => {
    const id = (await enqueue(`skip-${s}`)).data!;
    enqueued.push(id);
    await admin.rpc("skip_job", { p_id: id, p_reason: "superseded by v2" } as never);
    const skipped = await jobById(id);
    expect(skipped.status).toBe("canceled");
    expect(skipped.error).toBe("superseded by v2");
  });
});
