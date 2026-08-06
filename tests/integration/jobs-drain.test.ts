// @vitest-environment node
// Ensure the cron secret is present before any serverEnv() read (the routes and
// auth helper read it lazily at call time, so a module-scope assignment suffices).
process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret-value";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { adminClient, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainWithLease, monitorWithLease } from "@/lib/ops/scheduled";
import { POST as drainPOST } from "@/app/api/internal/jobs/drain/route";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Production job-drain safety (§1–§2): durable lease prevents overlapping drains,
 * a crashed worker's lease is reclaimable after TTL, the drain reports structured
 * results, dead-letters stay visible, and the route authenticates via CRON_SECRET
 * without ever leaking the service-role key.
 */
d("production job drain & lease", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId: string;

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `dr-${s}`, display_name: "DR" }).select("id").single();
    tenantId = t!.id;
  }, 30_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    await admin.from("worker_leases").delete().like("partition", `test:${s}%`);
  });

  it("grants a lease once, blocks a second holder, releases, and reclaims an expired lease", async () => {
    const partition = `test:${s}:lease`;
    expect((await admin.rpc("acquire_worker_lease", { p_partition: partition, p_holder: "h1", p_ttl_seconds: 300 } as never)).data).toBe(true);
    expect((await admin.rpc("acquire_worker_lease", { p_partition: partition, p_holder: "h2", p_ttl_seconds: 300 } as never)).data).toBe(false);
    await admin.rpc("release_worker_lease", { p_partition: partition, p_holder: "h1" } as never);
    expect((await admin.rpc("acquire_worker_lease", { p_partition: partition, p_holder: "h2", p_ttl_seconds: 300 } as never)).data).toBe(true);
    // Simulate a crashed holder: force the lease past its TTL → another worker may steal it.
    await admin.from("worker_leases").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("partition", partition);
    expect((await admin.rpc("acquire_worker_lease", { p_partition: partition, p_holder: "h3", p_ttl_seconds: 300 } as never)).data).toBe(true);
    await admin.rpc("release_worker_lease", { p_partition: partition, p_holder: "h3" } as never);
  });

  it("drains an empty partition with a structured, acquired result", async () => {
    const run = await drainWithLease(admin, { tenantId, holder: crypto.randomUUID() });
    expect(run.ok).toBe(true);
    expect(run.acquired).toBe(true);
    expect(run.result).toMatchObject({ claimed: 0, succeeded: 0, deadLettered: 0 });
    expect(typeof run.durationMs).toBe("number");
  });

  it("processes a job and keeps a dead-letter visible (never vanishes)", async () => {
    // A job with no registered handler and a 1-attempt budget dead-letters on first run.
    await admin.rpc("enqueue_job", { p_tenant: tenantId, p_job_type: "projection.__nonexistent__", p_payload: {}, p_dedup_key: `dr-${s}-dead`, p_max_attempts: 1 } as never);
    const run = await drainWithLease(admin, { tenantId, holder: crypto.randomUUID() });
    expect(run.acquired).toBe(true);
    expect(run.result!.claimed).toBeGreaterThanOrEqual(1);
    expect(run.result!.deadLettered).toBeGreaterThanOrEqual(1);
    const { data: dead } = await admin.from("system_jobs").select("status,error").eq("tenant_id", tenantId).eq("dedup_key", `dr-${s}-dead`).single();
    expect(dead!.status).toBe("dead"); // terminal, visible — not deleted
    expect(dead!.error).toBeTruthy();
  });

  it("prevents an overlapping drain of the same partition", async () => {
    const partition = `jobs:${tenantId}`;
    await admin.rpc("acquire_worker_lease", { p_partition: partition, p_holder: "other-worker", p_ttl_seconds: 300 } as never);
    const run = await drainWithLease(admin, { tenantId, holder: crypto.randomUUID() });
    expect(run.acquired).toBe(false); // someone else owns the partition
    expect(run.result).toBeNull();
    await admin.rpc("release_worker_lease", { p_partition: partition, p_holder: "other-worker" } as never);
  });

  it("runs the projection monitor for a tenant", async () => {
    const run = await monitorWithLease(admin, { tenantId, holder: crypto.randomUUID() });
    expect(run.ok).toBe(true);
    expect(run.acquired).toBe(true);
    expect(run.tenantsChecked).toBe(1);
  });

  it("route rejects an unauthenticated drain and accepts a valid one without leaking secrets", async () => {
    const url = "https://app.test/api/internal/jobs/drain";
    const unauth = await drainPOST(new NextRequest(url, { method: "POST" }));
    expect(unauth.status).toBe(401);

    const ok = await drainPOST(
      new NextRequest(url, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ tenantId }),
      }),
    );
    expect(ok.status).toBe(200);
    const text = await ok.clone().text();
    expect(text).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY!); // no service-role key in the body
    const body = JSON.parse(text);
    expect(body).toMatchObject({ ok: true, partition: `jobs:${tenantId}` });
  });
});
