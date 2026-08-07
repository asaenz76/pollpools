import { describe, it, expect } from "vitest";
import { resolveTenantProviders } from "@/lib/providers";

describe("resolveTenantProviders", () => {
  it("resolves the built-in defaults for an empty config", () => {
    const m = resolveTenantProviders({});
    expect(m.result.id).toBe("manual");
    expect(m.event.id).toBe("manual");
    expect(m.notifications.map((p) => p.channel)).toEqual(["in_app"]);
    expect(m.media).toBeNull();
  });

  it("tolerates null / non-object config", () => {
    expect(resolveTenantProviders(null).result.id).toBe("manual");
    expect(resolveTenantProviders("nonsense").event.id).toBe("manual");
  });

  it("honors an explicitly named provider", () => {
    const m = resolveTenantProviders({ result: "manual", event: "manual", media: "youtube" });
    expect(m.result.id).toBe("manual");
    expect(m.media?.id).toBe("youtube");
  });

  it("fails loudly when result/event name an unimplemented provider", () => {
    expect(() => resolveTenantProviders({ result: "webhook" })).toThrow(/RESULT_PROVIDER_NOT_CONFIGURED/);
    expect(() => resolveTenantProviders({ event: "api" })).toThrow(/EVENT_PROVIDER_NOT_CONFIGURED/);
  });

  it("drops unimplemented notification channels but always keeps in_app", () => {
    const m = resolveTenantProviders({ notification: ["email", "in_app"] });
    expect(m.notifications.map((p) => p.channel)).toEqual(["in_app"]);
  });

  it("guarantees in_app even when config omits it", () => {
    const m = resolveTenantProviders({ notification: ["email"] });
    expect(m.notifications.some((p) => p.channel === "in_app")).toBe(true);
  });

  it("deduplicates configured channels", () => {
    const m = resolveTenantProviders({ notification: ["in_app", "in_app"] });
    expect(m.notifications).toHaveLength(1);
  });
});
