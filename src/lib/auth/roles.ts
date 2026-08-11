import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { TenantViewer } from "@/lib/auth/session";

/**
 * Central role/context resolution (RX.2). Authorization stays where it belongs —
 * RLS + SECURITY DEFINER RPCs + per-page/per-action server checks. This module only
 * decides PRESENTATION: which of the three product experiences a viewer defaults
 * into, and where a fresh login should land. Nothing here grants access; it maps an
 * already-resolved standing to a role label and a default route. Keep role checks
 * out of arbitrary components — resolve here.
 */
export type PlatformRole = "super_admin" | "tenant_operator" | "member" | "guest";

/**
 * Map a resolved TenantViewer to the role whose experience they default into for a
 * given tenant. Super-admin wins (govern); then tenant operator (operate) = owns a
 * creator here OR holds an admin/creator membership; otherwise member (participate).
 * A tenant operator is still a member elsewhere — this is presentation context, not
 * a permanent identity (spec §11).
 */
export function platformRoleOf(viewer: TenantViewer | null): PlatformRole {
  if (!viewer) return "guest";
  if (viewer.isSuperAdmin) return "super_admin";
  if (viewer.isCreatorOwner || viewer.membershipRole === "creator" || viewer.membershipRole === "admin") {
    return "tenant_operator";
  }
  return "member";
}

/** Can this viewer operate (manage) the given tenant? (owns a creator or admin/creator membership). */
export function canOperateTenant(viewer: TenantViewer | null): boolean {
  const role = platformRoleOf(viewer);
  return role === "tenant_operator" || role === "super_admin";
}

/** The default landing path for a role, relative to a tenant slug. */
export function defaultPathForRole(role: PlatformRole, slug: string): string {
  switch (role) {
    case "super_admin":
      return "/admin";
    case "tenant_operator":
      return `/t/${slug}/creator`;
    default:
      return `/t/${slug}`;
  }
}

/**
 * Resolve the default post-login destination for a just-authenticated user, using
 * the SAME client that performed the sign-in (so the new session is visible). Reads
 * only membership/ownership standing — never a client-supplied hint.
 */
export async function resolveDefaultDestination(
  supabase: SupabaseClient<Database>,
  userId: string,
  slug: string,
): Promise<string> {
  const { data: superAdmin } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .is("tenant_id", null)
    .maybeSingle();
  if (superAdmin) return "/admin";

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (tenant) {
    const [creator, membership] = await Promise.all([
      supabase.from("creators").select("id").eq("tenant_id", tenant.id).eq("owner_user_id", userId).limit(1),
      supabase.from("tenant_memberships").select("role, status").eq("tenant_id", tenant.id).eq("user_id", userId).maybeSingle(),
    ]);
    const isOperator =
      (creator.data?.length ?? 0) > 0 ||
      (membership.data?.status === "active" && (membership.data.role === "creator" || membership.data.role === "admin"));
    if (isOperator) return `/t/${slug}/creator`;
  }
  return `/t/${slug}`;
}
