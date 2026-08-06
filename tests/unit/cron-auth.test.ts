import { describe, it, expect } from "vitest";
import { authorizeCron } from "@/lib/ops/cron";

const req = (headers: Record<string, string> = {}) => new Request("https://app.test/api/internal/jobs/drain", { headers });

/** Auth for the internal scheduled endpoints (§1). Secret is injected so the logic is env-independent. */
describe("authorizeCron", () => {
  it("refuses to run when no secret is configured (503, never open)", () => {
    const r = authorizeCron(req({ authorization: "Bearer anything" }), undefined);
    expect(r).toEqual({ ok: false, status: 503, message: expect.any(String) });
  });

  it("rejects a request with no credential (401)", () => {
    const r = authorizeCron(req(), "the-secret");
    expect(r).toEqual({ ok: false, status: 401, message: expect.any(String) });
  });

  it("rejects a wrong secret (401)", () => {
    expect(authorizeCron(req({ authorization: "Bearer wrong" }), "the-secret").ok).toBe(false);
    expect(authorizeCron(req({ "x-cron-secret": "wrong" }), "the-secret").ok).toBe(false);
  });

  it("accepts the correct secret via Bearer or x-cron-secret", () => {
    expect(authorizeCron(req({ authorization: "Bearer the-secret" }), "the-secret")).toEqual({ ok: true });
    expect(authorizeCron(req({ "x-cron-secret": "the-secret" }), "the-secret")).toEqual({ ok: true });
  });

  it("is not fooled by a length-mismatched or prefixed token", () => {
    expect(authorizeCron(req({ authorization: "Bearer the-secret-extra" }), "the-secret").ok).toBe(false);
    expect(authorizeCron(req({ authorization: "Bearer the" }), "the-secret").ok).toBe(false);
  });
});
