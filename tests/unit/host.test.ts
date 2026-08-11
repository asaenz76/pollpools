import { describe, it, expect } from "vitest";
import { classifyHost, tenantRewriteTarget, stripTenantPrefix } from "@/lib/tenant/host";

const ROOT = "pollpools.com";

describe("classifyHost", () => {
  it("treats the platform apex, www, and dev hosts as platform", () => {
    expect(classifyHost("pollpools.com", ROOT).kind).toBe("platform");
    expect(classifyHost("www.pollpools.com", ROOT).kind).toBe("platform");
    expect(classifyHost("localhost:3000", ROOT).kind).toBe("platform");
    expect(classifyHost("127.0.0.1", ROOT).kind).toBe("platform");
    expect(classifyHost(null, ROOT).kind).toBe("platform");
  });
  it("classifies a non-reserved subdomain as a tenant subdomain", () => {
    expect(classifyHost("marbles.pollpools.com", ROOT)).toEqual({ kind: "subdomain", slug: "marbles" });
  });
  it("treats reserved subdomains as platform", () => {
    expect(classifyHost("app.pollpools.com", ROOT).kind).toBe("platform");
    expect(classifyHost("api.pollpools.com", ROOT).kind).toBe("platform");
  });
  it("classifies any other dotted host as a candidate custom domain", () => {
    expect(classifyHost("marblegrandprix.com", ROOT)).toEqual({ kind: "custom", domain: "marblegrandprix.com" });
    expect(classifyHost("www.marblegrandprix.com", ROOT)).toEqual({ kind: "custom", domain: "www.marblegrandprix.com" });
    expect(classifyHost("predictions.exampleclub.com", ROOT)).toEqual({ kind: "custom", domain: "predictions.exampleclub.com" });
  });
  it("is case- and port-insensitive", () => {
    expect(classifyHost("MarbleGrandPrix.com:443", ROOT)).toEqual({ kind: "custom", domain: "marblegrandprix.com" });
  });
  it("fails safe for a bare unknown single-label host", () => {
    expect(classifyHost("randombox", ROOT).kind).toBe("unknown");
  });
});

describe("tenantRewriteTarget", () => {
  it("maps the root to the tenant home", () => {
    expect(tenantRewriteTarget("marbles", "/")).toBe("/t/marbles");
  });
  it("maps nested tenant paths", () => {
    expect(tenantRewriteTarget("marbles", "/e/race-1")).toBe("/t/marbles/e/race-1");
    expect(tenantRewriteTarget("marbles", "/leaderboard")).toBe("/t/marbles/leaderboard");
    expect(tenantRewriteTarget("marbles", "/creator")).toBe("/t/marbles/creator");
  });
  it("never rewrites platform/api/admin/static or already-prefixed paths", () => {
    expect(tenantRewriteTarget("marbles", "/api/webhooks/x")).toBeNull();
    expect(tenantRewriteTarget("marbles", "/admin")).toBeNull();
    expect(tenantRewriteTarget("marbles", "/admin/tenants")).toBeNull();
    expect(tenantRewriteTarget("marbles", "/t/marbles/e/x")).toBeNull();
    expect(tenantRewriteTarget("marbles", "/favicon.ico")).toBeNull();
    expect(tenantRewriteTarget("marbles", "/robots.txt")).toBeNull();
  });
});

describe("stripTenantPrefix", () => {
  it("strips the tenant's own prefix to a clean path", () => {
    expect(stripTenantPrefix("marbles", "/t/marbles")).toBe("/");
    expect(stripTenantPrefix("marbles", "/t/marbles/e/race-1")).toBe("/e/race-1");
  });
  it("returns null when there is no own-prefix to strip", () => {
    expect(stripTenantPrefix("marbles", "/e/race-1")).toBeNull();
    expect(stripTenantPrefix("marbles", "/t/other/e/x")).toBeNull();
  });
});
