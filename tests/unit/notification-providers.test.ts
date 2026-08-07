import { describe, it, expect } from "vitest";
import {
  inAppNotificationProvider,
  resolveNotificationProvider,
  deliverNotification,
  toDeliverable,
  type DeliverableNotification,
} from "@/lib/providers/notification";

const sample: DeliverableNotification = {
  id: "n1",
  tenantId: "t1",
  userId: "u1",
  type: "event_result_published",
  title: "Result in",
  body: null,
  metadata: {},
};

describe("in-app notification provider", () => {
  it("is always configured and delivers successfully (row is the delivery)", async () => {
    expect(inAppNotificationProvider.isConfigured()).toBe(true);
    const r = await inAppNotificationProvider.deliver(sample);
    expect(r).toEqual({ ok: true, channel: "in_app" });
  });
});

describe("resolveNotificationProvider", () => {
  it("defaults to in_app", () => {
    expect(resolveNotificationProvider(null).channel).toBe("in_app");
    expect(resolveNotificationProvider("in_app").channel).toBe("in_app");
  });

  it("throws for a recognized-but-unimplemented channel", () => {
    expect(() => resolveNotificationProvider("email")).toThrow(/NOTIFICATION_PROVIDER_NOT_CONFIGURED/);
  });
});

describe("toDeliverable", () => {
  it("maps a notifications row into the channel-agnostic shape", () => {
    const d = toDeliverable({
      id: "n2",
      tenant_id: "t2",
      user_id: "u2",
      type: "achievement_earned",
      title: "Nice",
      body: "You earned a badge",
      metadata: { badge: "streak" },
    });
    expect(d).toEqual({
      id: "n2",
      tenantId: "t2",
      userId: "u2",
      type: "achievement_earned",
      title: "Nice",
      body: "You earned a badge",
      metadata: { badge: "streak" },
    });
  });

  it("defaults non-object metadata to an empty object", () => {
    const d = toDeliverable({ id: "n3", tenant_id: "t", user_id: "u", type: "streak_milestone", title: "x", body: null, metadata: null });
    expect(d.metadata).toEqual({});
  });
});

describe("deliverNotification", () => {
  it("skips (does not fail) when a provider is unconfigured", async () => {
    const stub = { channel: "email" as const, label: "Email", isConfigured: () => false, deliver: async () => ({ ok: true as const, channel: "email" as const }) };
    const r = await deliverNotification(stub, sample);
    expect(r).toEqual({ ok: true, channel: "email", skipped: true });
  });
});
