import { describe, it, expect } from "vitest";
import {
  classifyDomainType,
  verificationRecordName,
  verificationTxtValue,
  txtRecordsContainToken,
  primaryHostOf,
  computeDomainRedirect,
  baseUrlForHost,
  safeReturnPath,
} from "@/lib/domain/domains";

describe("classifyDomainType", () => {
  const root = "pe.example"; // neutral placeholder root domain
  it("classifies a subdomain of the platform root as platform", () => {
    expect(classifyDomainType("marbles.pe.example", root)).toBe("platform");
    expect(classifyDomainType("pe.example", root)).toBe("platform");
  });
  it("classifies a customer subdomain vs apex", () => {
    expect(classifyDomainType("predict.customer.com", root)).toBe("custom_subdomain");
    expect(classifyDomainType("customer.com", root)).toBe("custom_apex");
  });
  it("ignores ports", () => {
    expect(classifyDomainType("marbles.pe.example:3000", "pe.example:3000")).toBe("platform");
  });
});

describe("verification records", () => {
  it("builds a neutral TXT record name and value", () => {
    expect(verificationRecordName("predict.customer.com")).toBe("_pe-verify.predict.customer.com");
    expect(verificationTxtValue("abc123")).toBe("pe-verify=abc123");
  });
  it("matches a token only on an exact record", () => {
    expect(txtRecordsContainToken(["pe-verify=abc123"], "abc123")).toBe(true);
    expect(txtRecordsContainToken(["  pe-verify=abc123  "], "abc123")).toBe(true);
    expect(txtRecordsContainToken(["pe-verify=other"], "abc123")).toBe(false);
    expect(txtRecordsContainToken([], "abc123")).toBe(false);
  });
});

describe("primary + redirect", () => {
  const domains = [
    { domain: "customer.com", isPrimary: true, verified: true },
    { domain: "www.customer.com", isPrimary: false, verified: true },
    { domain: "old.customer.com", isPrimary: false, verified: false },
  ];
  it("finds the primary verified host", () => {
    expect(primaryHostOf(domains)).toBe("customer.com");
    expect(primaryHostOf([{ domain: "x.com", isPrimary: true, verified: false }])).toBeNull();
  });
  it("redirects a verified non-primary host to the primary", () => {
    expect(computeDomainRedirect("www.customer.com", domains)).toBe("customer.com");
  });
  it("does not redirect the primary host itself", () => {
    expect(computeDomainRedirect("customer.com", domains)).toBeNull();
  });
  it("does not redirect an unverified host", () => {
    expect(computeDomainRedirect("old.customer.com", domains)).toBeNull();
  });
  it("does not redirect when there is no primary", () => {
    expect(computeDomainRedirect("a.com", [{ domain: "a.com", isPrimary: false, verified: true }])).toBeNull();
  });
});

describe("baseUrlForHost", () => {
  it("uses http for localhost and https otherwise", () => {
    expect(baseUrlForHost("localhost:3000")).toBe("http://localhost:3000");
    expect(baseUrlForHost("customer.com")).toBe("https://customer.com");
  });
});

describe("safeReturnPath", () => {
  it("keeps a clean local path", () => {
    expect(safeReturnPath("/t/marbles/leaderboard")).toBe("/t/marbles/leaderboard");
  });
  it("rejects absolute, protocol-relative, and empty targets", () => {
    expect(safeReturnPath("https://evil.example/steal")).toBe("/");
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("/\\evil")).toBe("/");
    expect(safeReturnPath("")).toBe("/");
    expect(safeReturnPath(null)).toBe("/");
  });
});
