import { describe, it, expect } from "vitest";
import { platformRoleOf, canOperateTenant, defaultPathForRole } from "@/lib/auth/roles";
import type { TenantViewer } from "@/lib/auth/session";

/**
 * RX.2 — central role/context resolution. These are the PRESENTATION mappings
 * (which experience a viewer defaults into); authorization is enforced elsewhere.
 */
const viewer = (over: Partial<TenantViewer>): TenantViewer => ({
  user: { id: "u", email: null },
  membershipRole: null,
  isCreatorOwner: false,
  isSuperAdmin: false,
  ...over,
});

describe("platformRoleOf", () => {
  it("guest when not signed in", () => {
    expect(platformRoleOf(null)).toBe("guest");
  });
  it("super_admin wins over everything", () => {
    expect(platformRoleOf(viewer({ isSuperAdmin: true, isCreatorOwner: true }))).toBe("super_admin");
  });
  it("tenant_operator when they own a creator here", () => {
    expect(platformRoleOf(viewer({ isCreatorOwner: true }))).toBe("tenant_operator");
  });
  it("tenant_operator for admin/creator membership", () => {
    expect(platformRoleOf(viewer({ membershipRole: "admin" }))).toBe("tenant_operator");
    expect(platformRoleOf(viewer({ membershipRole: "creator" }))).toBe("tenant_operator");
  });
  it("member for a plain active member", () => {
    expect(platformRoleOf(viewer({ membershipRole: "member" }))).toBe("member");
  });
});

describe("canOperateTenant", () => {
  it("true for operators and super admins, false otherwise", () => {
    expect(canOperateTenant(viewer({ isCreatorOwner: true }))).toBe(true);
    expect(canOperateTenant(viewer({ isSuperAdmin: true }))).toBe(true);
    expect(canOperateTenant(viewer({ membershipRole: "member" }))).toBe(false);
    expect(canOperateTenant(null)).toBe(false);
  });
});

describe("defaultPathForRole", () => {
  it("routes each role to its home", () => {
    expect(defaultPathForRole("super_admin", "marbles")).toBe("/admin");
    expect(defaultPathForRole("tenant_operator", "marbles")).toBe("/t/marbles/creator");
    expect(defaultPathForRole("member", "marbles")).toBe("/t/marbles");
    expect(defaultPathForRole("guest", "marbles")).toBe("/t/marbles");
  });
});
