import "server-only";

import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string | null };

/** The authenticated user for this request, or null. Verified via Supabase Auth. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? null };
});

/** Whether the current user holds the global super_admin grant. Server-checked. */
export const isSuperAdmin = cache(async (): Promise<boolean> => {
  const user = await getSessionUser();
  if (!user) return false;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .is("tenant_id", null)
    .maybeSingle();
  return Boolean(data);
});

export type TenantViewer = {
  user: SessionUser;
  membershipRole: "member" | "creator" | "admin" | null;
  isCreatorOwner: boolean;
  isSuperAdmin: boolean;
};

/**
 * Resolve the current viewer's standing within a specific tenant: their
 * membership role, whether they own a creator there, and super-admin status.
 * Returns null when not signed in.
 */
export const getTenantViewer = cache(
  async (tenantId: string): Promise<TenantViewer | null> => {
    const user = await getSessionUser();
    if (!user) return null;

    const supabase = await createServerSupabase();
    const [membership, creator, superAdmin] = await Promise.all([
      supabase
        .from("tenant_memberships")
        .select("role, status")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("creators")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("owner_user_id", user.id)
        .limit(1),
      isSuperAdmin(),
    ]);

    const role =
      membership.data && membership.data.status === "active"
        ? (membership.data.role as "member" | "creator" | "admin")
        : null;

    return {
      user,
      membershipRole: role,
      isCreatorOwner: (creator.data?.length ?? 0) > 0,
      isSuperAdmin: superAdmin,
    };
  },
);
