import { describe, it, expect } from "vitest";
import { MemoryEmailTransport, createEmailNotificationProvider, emailTransportFromEnv, applicationEmailTransportFromEnv, RESEND_ENDPOINT } from "@/lib/providers/email";
import { deliverNotification, type DeliverableNotification } from "@/lib/providers/notification";

const sample: DeliverableNotification = {
  id: "n1",
  tenantId: "t1",
  userId: "u1",
  type: "plan_upgraded",
  title: "You've reached Champion!",
  body: "Your revenue shares have improved.",
  metadata: {},
};

describe("email NotificationProvider (Phase 8-C)", () => {
  it("delivers a notification through the transport as an email", async () => {
    const transport = new MemoryEmailTransport();
    const provider = createEmailNotificationProvider({ transport, resolveEmail: async () => "creator@example.test", from: "hello@platform.test" });
    expect(provider.isConfigured()).toBe(true);
    const r = await provider.deliver(sample);
    expect(r).toEqual({ ok: true, channel: "email" });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({
      to: "creator@example.test",
      subject: "You've reached Champion!",
      text: "Your revenue shares have improved.",
      from: "hello@platform.test",
    });
  });

  it("reports a delivery failure without throwing", async () => {
    const provider = createEmailNotificationProvider({ transport: new MemoryEmailTransport("SMTP_DOWN"), resolveEmail: async () => "x@example.test" });
    const r = await provider.deliver(sample);
    expect(r).toEqual({ ok: false, channel: "email", error: "SMTP_DOWN" });
  });

  it("skips (does not fail) when the recipient has no email on file", async () => {
    const transport = new MemoryEmailTransport();
    const provider = createEmailNotificationProvider({ transport, resolveEmail: async () => null });
    const r = await provider.deliver(sample);
    expect(r).toEqual({ ok: true, channel: "email", skipped: true });
    expect(transport.sent).toHaveLength(0);
  });

  it("is unconfigured (and skips) when there is no transport", async () => {
    const provider = createEmailNotificationProvider({ transport: null, resolveEmail: async () => "x@example.test" });
    expect(provider.isConfigured()).toBe(false);
    const r = await deliverNotification(provider, sample);
    expect(r).toEqual({ ok: true, channel: "email", skipped: true });
  });

  it("builds no transport from env when credentials are absent", () => {
    expect(emailTransportFromEnv({})).toBeNull();
    expect(emailTransportFromEnv({ EMAIL_API_ENDPOINT: "https://x", EMAIL_API_KEY: "k", EMAIL_FROM: "a@b.c" })).not.toBeNull();
  });

  it("prefers Resend (RESEND_API_KEY + EMAIL_FROM) for the application transport, else falls back / null", () => {
    expect(applicationEmailTransportFromEnv({})).toBeNull();
    expect(applicationEmailTransportFromEnv({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.c" })).not.toBeNull();
    expect(RESEND_ENDPOINT).toContain("resend.com");
    // Falls back to the generic transport when Resend isn't set.
    expect(applicationEmailTransportFromEnv({ EMAIL_API_ENDPOINT: "https://x", EMAIL_API_KEY: "k", EMAIL_FROM: "a@b.c" })).not.toBeNull();
  });
});
