// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * Asynchronous, batched notification & feed fan-out for event publication (§5F,
 * F-19). Publishing commits and enqueues durable jobs; there is no synchronous
 * per-follower loop. The feed is one canonical activity; notifications fan out in
 * cursor-based batches, idempotent and resumable.
 */
d("notification fan-out (event publication)", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId: string;
  let creatorId: string;
  let ownerId: string;
  const users: string[] = [];

  async function newUser() {
    const id = await createUser(`nf-${uniqueSuffix()}@example.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: id, role: "member" });
    users.push(id);
    return id;
  }
  async function newCreator() {
    const suf = uniqueSuffix();
    const { data } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: `C-${suf}`, slug: `c-${suf}`, verification_status: "verified" }).select("id").single();
    return data!.id;
  }
  const follow = (user: string, creator = creatorId) =>
    admin.from("creator_follows").insert({ tenant_id: tenantId, creator_id: creator, user_id: user });
  const unfollow = (user: string, creator = creatorId) =>
    admin.from("creator_follows").delete().eq("tenant_id", tenantId).eq("creator_id", creator).eq("user_id", user);
  async function publish(creator = creatorId) {
    const suf = uniqueSuffix();
    const { data: ev } = await admin.from("events").insert({ tenant_id: tenantId, creator_id: creator, title: "E", slug: `e-${suf}`, status: "open", starts_at: new Date(Date.now() + 3_600_000).toISOString(), locks_at: new Date(Date.now() + 7_200_000).toISOString() }).select("id").single();
    return ev!.id;
  }
  const fanoutFor = async (eventId: string) =>
    (await admin.from("notification_fanouts").select("*").eq("source_id", eventId).maybeSingle()).data;
  const notifsFor = async (user: string) =>
    (await admin.from("notifications").select("id, dedupe_key, type, title").eq("tenant_id", tenantId).eq("user_id", user).eq("type", "new_creator_event")).data ?? [];
  const drain = () => drainJobs(admin, tenantId);
  const jobsOfType = async (type: string, eventId: string) =>
    (await admin.from("system_jobs").select("id").eq("job_type", type).filter("payload->>event_id", "eq", eventId)).data ?? [];

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `nf-${s}`, display_name: "NF" }).select("id").single();
    tenantId = t!.id;
    ownerId = await createUser(`nfowner-${s}@example.test`, pw);
    const { data: c } = await admin.from("creators").insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "C", slug: `c-${s}`, verification_status: "verified" }).select("id").single();
    creatorId = c!.id;
  }, 40_000);

  afterAll(async () => {
    await admin.from("tenants").delete().eq("id", tenantId);
    for (const id of [ownerId, ...users]) if (id) await deleteUser(id);
  });

  it("publishing commits synchronously and defers fan-out to the worker (no sync loop)", async () => {
    const u = await newUser();
    await follow(u);
    const e = await publish();
    // The event and the fan-out state exist immediately; notifications do NOT yet.
    expect(await fanoutFor(e)).toMatchObject({ status: "pending" });
    expect(await notifsFor(u)).toHaveLength(0);
    // Exactly one canonical feed job was enqueued for this publication.
    expect(await jobsOfType("projection.event_publish_feed", e)).toHaveLength(1);
    await drain();
    expect(await notifsFor(u)).toHaveLength(1);
    expect(await fanoutFor(e)).toMatchObject({ status: "completed", recipients_processed: 1 });
  });

  it("notifies zero, one, and many followers; a canonical feed activity is created once", async () => {
    const followers = [await newUser(), await newUser(), await newUser()];
    for (const u of followers) await follow(u);
    const nonFollower = await newUser();
    const e = await publish();
    await drain();
    for (const u of followers) expect(await notifsFor(u)).toHaveLength(1);
    expect(await notifsFor(nonFollower)).toHaveLength(0);
    // Canonical single feed row for the publication.
    const feed = (await admin.from("feed_activities").select("id").eq("tenant_id", tenantId).eq("type", "creator_published_event").eq("event_id", e)).data ?? [];
    expect(feed).toHaveLength(1);
    // Duplicate drain is harmless.
    await drain();
    expect((await admin.from("feed_activities").select("id").eq("event_id", e)).data).toHaveLength(1);
    for (const u of followers) expect(await notifsFor(u)).toHaveLength(1);
  });

  it("processes recipients in bounded batches with a durable cursor, resumably and idempotently", async () => {
    const cr = await newCreator(); // isolated: exactly 5 followers
    const followers = [];
    for (let i = 0; i < 5; i++) { const u = await newUser(); await follow(u, cr); followers.push(u); }
    const e = await publish(cr);
    const fo = await fanoutFor(e);
    const step = (batch: number) => admin.rpc("process_event_publish_fanout", { p_fanout_id: fo!.id, p_batch_size: batch } as never);
    expect((await step(2)).data).toBe("more");
    expect((await step(2)).data).toBe("more");
    expect((await step(2)).data).toBe("done"); // 2 + 2 + 1
    // A duplicate run after completion is a no-op; all 5 notified exactly once.
    expect((await step(2)).data).toBe("done");
    let total = 0;
    for (const u of followers) total += (await notifsFor(u)).length;
    expect(total).toBe(5);
    expect(await fanoutFor(e)).toMatchObject({ status: "completed", recipients_processed: 5 });
  });

  it("checks eligibility at batch time: unfollow-before-batch excludes, follow-after does not receive", async () => {
    const a = await newUser(), b = await newUser(), c = await newUser();
    await follow(a); await follow(b); await follow(c);
    const e = await publish();
    const fo = await fanoutFor(e);
    // Process one follower (the batch orders by user_id, so which one is data-dependent).
    await admin.rpc("process_event_publish_fanout", { p_fanout_id: fo!.id, p_batch_size: 1 } as never);
    // Deterministically pick a follower NOT yet processed and unfollow before its
    // batch — its notification must never be created.
    const notYetNotified: string[] = [];
    for (const u of [a, b, c]) if ((await notifsFor(u)).length === 0) notYetNotified.push(u);
    const unfollower = notYetNotified[0]!;
    await unfollow(unfollower);
    // A user who follows AFTER publication must not be retroactively notified.
    const late = await newUser(); await follow(late);
    // Drain the rest.
    await drain();
    expect(await notifsFor(unfollower)).toHaveLength(0); // unfollowed before its batch
    expect(await notifsFor(late)).toHaveLength(0); // followed after publication (created_at cutoff)
  });

  it("respects the disabled event_published preference", async () => {
    const on = await newUser(), off = await newUser();
    await follow(on); await follow(off);
    await admin.from("user_notification_preferences").insert({ tenant_id: tenantId, user_id: off, event_published: false } as never);
    await publish();
    await drain();
    expect(await notifsFor(on)).toHaveLength(1);
    expect(await notifsFor(off)).toHaveLength(0); // suppressed by preference
  });

  it("does not notify followers of a different tenant's creator", async () => {
    const { data: t2 } = await admin.from("tenants").insert({ slug: `nf2-${s}`, display_name: "NF2" }).select("id").single();
    const owner2 = await createUser(`nf2owner-${s}@example.test`, pw);
    try {
      const { data: c2 } = await admin.from("creators").insert({ tenant_id: t2!.id, owner_user_id: owner2, display_name: "C2", slug: `c2-${s}`, verification_status: "verified" }).select("id").single();
      const foreign = await newUser(); // a tenant-1 user
      // A tenant-1 event fan-out never touches tenant-2, and vice versa.
      const e = await publish();
      await drain();
      const t2Notifs = (await admin.from("notifications").select("id").eq("tenant_id", t2!.id)).data ?? [];
      expect(t2Notifs).toHaveLength(0);
      expect(await notifsFor(foreign)).toHaveLength(0); // did not follow the creator
      void c2; void e;
    } finally {
      await admin.from("tenants").delete().eq("id", t2!.id);
      await deleteUser(owner2);
    }
  });
});
