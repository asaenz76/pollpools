import Link from "next/link";
import { Shield, Settings2 } from "lucide-react";
import type { PlatformRole } from "@/lib/auth/roles";

/**
 * The single, deliberate context-switch affordance (spec §7/§21/§22). A member sees
 * nothing here — their whole experience is participation. A tenant operator gets a
 * "Manage" entry into their community operations; a super admin gets "Platform
 * Admin". Rendered in the tenant header so operators/admins can cross from the
 * participation (View Community) context into their operating context without
 * hand-editing URLs. Presentation only — every destination re-checks authorization
 * server-side.
 */
export function RoleContextBar({ role, tenantSlug }: { role: PlatformRole; tenantSlug: string }) {
  if (role === "super_admin") {
    return (
      <Link
        href="/admin"
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium hover:bg-muted"
      >
        <Shield className="size-3.5" aria-hidden />
        Platform Admin
      </Link>
    );
  }
  if (role === "tenant_operator") {
    return (
      <Link
        href={`/t/${tenantSlug}/creator`}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium hover:bg-muted"
      >
        <Settings2 className="size-3.5" aria-hidden />
        Manage
      </Link>
    );
  }
  return null;
}
