import { describe, it, expect } from "vitest";
import {
  resolveTenantRef,
  parseTenantPath,
  isValidTenantSlug,
} from "@/lib/tenant/resolver";

const ROOT = "predictionengine.example";

describe("isValidTenantSlug", () => {
  it("accepts lowercase slugs with hyphens", () => {
    expect(isValidTenantSlug("marbles")).toBe(true);
    expect(isValidTenantSlug("marble-league-2")).toBe(true);
  });
  it("rejects invalid slugs", () => {
    expect(isValidTenantSlug("Marbles")).toBe(false);
    expect(isValidTenantSlug("-bad")).toBe(false);
    expect(isValidTenantSlug("bad-")).toBe(false);
    expect(isValidTenantSlug("a b")).toBe(false);
    expect(isValidTenantSlug("")).toBe(false);
  });
});

describe("parseTenantPath", () => {
  it("extracts slug from /t/{slug}", () => {
    expect(parseTenantPath("/t/marbles")).toBe("marbles");
    expect(parseTenantPath("/t/marbles/events/123")).toBe("marbles");
  });
  it("returns null for non-tenant paths", () => {
    expect(parseTenantPath("/")).toBeNull();
    expect(parseTenantPath("/discover")).toBeNull();
    expect(parseTenantPath("/t/")).toBeNull();
  });
});

describe("resolveTenantRef", () => {
  it("resolves dev path routing first, even with a host", () => {
    expect(
      resolveTenantRef({ host: "localhost:3000", pathname: "/t/marbles", rootDomain: "localhost:3000" }),
    ).toEqual({ kind: "slug", slug: "marbles", source: "path" });
  });

  it("resolves a subdomain of the root domain", () => {
    expect(
      resolveTenantRef({ host: "marbles.predictionengine.example", pathname: "/feed", rootDomain: ROOT }),
    ).toEqual({ kind: "slug", slug: "marbles", source: "subdomain" });
  });

  it("ignores reserved subdomains", () => {
    expect(
      resolveTenantRef({ host: "www.predictionengine.example", pathname: "/", rootDomain: ROOT }),
    ).toBeNull();
  });

  it("treats an unrelated domain as a custom domain", () => {
    expect(
      resolveTenantRef({ host: "marblesleague.com", pathname: "/", rootDomain: ROOT }),
    ).toEqual({ kind: "domain", domain: "marblesleague.com", source: "custom" });
  });

  it("returns null on the platform apex", () => {
    expect(resolveTenantRef({ host: ROOT, pathname: "/", rootDomain: ROOT })).toBeNull();
    expect(resolveTenantRef({ host: "localhost:3000", pathname: "/", rootDomain: "localhost:3000" })).toBeNull();
  });

  it("strips ports before comparing", () => {
    expect(
      resolveTenantRef({ host: "marbles.predictionengine.example:3000", pathname: "/", rootDomain: `${ROOT}:3000` }),
    ).toEqual({ kind: "slug", slug: "marbles", source: "subdomain" });
  });

  it("does not treat a bare-host with no dot and no path as a tenant", () => {
    expect(resolveTenantRef({ host: "internal", pathname: "/", rootDomain: ROOT })).toBeNull();
  });
});
