// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { deliverEmailNotification } from "@/lib/notifications/email-delivery";
import { MemoryEmailTransport } from "@/lib/providers/email";

const d = integrationEnvReady ? describe : describe.skip;

/**
 * PL.3 — durable email delivery. The notifications trigger enqueues onto system_jobs
 * (no second queue); delivery is idempotent, records state, respects the opt-in +
 * platform switch, skips safely when unconfigured, and throws on failure so the
 * queue retries/dead-letters. Settlement is unaffected.
 */
d("email notification delivery", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let tenantId = "";
  let userId = "";
  const email = `nem-${s}@example.test`;

  const insertNotif = (type: string, dedupe: string) =>
    admin.from("notifications").insert({ tenant_id: tenantId, user_id: userId, type: type as never, title: "Result available", body: "Your prediction was graded.", dedupe_key: dedupe } as never).select("id").single();
  const jobsFor = async (notifId: string) =>
    (await admin.from("system_jobs").select("id, dedup_key").eq("job_type", "notification.email").eq("dedup_key", `email:${notifId}`)).data ?? [];

  beforeAll(async () => {
    const { data: t } = await admin.from("tenants").insert({ slug: `nem-${s}`, display_name: "NEM" } as never).select("id").single();
    tenantId = t!.id;
    userId = await createUser(email, "Password123!");
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: userId, role: "member" } as never);
    await admin.from("platform_config").update({ email_delivery_enabled: true } as never).eq("id", true);
  }, 60_000);

  afterAll(async () => {
    await admin.from("platform_config").update({ email_delivery_enabled: false } as never).eq("id", true);
    if (userId) await deleteUser(userId);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  it("enqueues an email job only when the user opted in", async () => {
    // Opted out (no prefs row / email_enabled false default) → no job.
    const a = await insertNotif("prediction_correct", `nem-out-${s}`);
    expect((await jobsFor(a.data!.id)).length).toBe(0);

    // Opt in, then a new eligible notification enqueues exactly one deduped job.
    await admin.from("user_notification_preferences").upsert({ tenant_id: tenantId, user_id: userId, email_enabled: true } as never, { onConflict: "tenant_id,user_id" });
    const b = await insertNotif("prediction_correct", `nem-in-${s}`);
    expect((await jobsFor(b.data!.id)).length).toBe(1);
  });

  it("delivers via the transport, records state, and is idempotent on retry", async () => {
    const n = await insertNotif("event_canceled", `nem-send-${s}`);
    const transport = new MemoryEmailTransport();
    expect(await deliverEmailNotification(admin, n.data!.id, transport)).toBe("sent");
    expect(transport.sent.length).toBe(1);
    expect(transport.sent[0]!.to).toBe(email);
    expect(transport.sent[0]!.subject).toBe("Result available");
    const row = (await admin.from("notification_deliveries").select("status").eq("notification_id", n.data!.id).eq("channel", "email").single()).data;
    expect(row?.status).toBe("sent");
    // Retry → no second send.
    expect(await deliverEmailNotification(admin, n.data!.id, transport)).toBe("sent");
    expect(transport.sent.length).toBe(1);
  });

  it("skips safely when the transport is unconfigured (never a fake send)", async () => {
    const n = await insertNotif("event_canceled", `nem-skip-${s}`);
    expect(await deliverEmailNotification(admin, n.data!.id, null)).toBe("skipped");
    const row = (await admin.from("notification_deliveries").select("status").eq("notification_id", n.data!.id).eq("channel", "email").single()).data;
    expect(row?.status).toBe("skipped");
  });

  it("throws on transport failure (so the durable queue retries/dead-letters) and records failed", async () => {
    const n = await insertNotif("event_canceled", `nem-fail-${s}`);
    const failing = new MemoryEmailTransport("SMTP_DOWN");
    await expect(deliverEmailNotification(admin, n.data!.id, failing)).rejects.toThrow();
    const row = (await admin.from("notification_deliveries").select("status, error, attempts").eq("notification_id", n.data!.id).eq("channel", "email").single()).data;
    expect(row?.status).toBe("failed");
    expect(row?.attempts).toBe(1);
  });
});
