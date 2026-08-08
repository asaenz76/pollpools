import Link from "next/link";
import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/ops/admin";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/growth", label: "Growth" },
  { href: "/admin/templates", label: "Templates" },
];

/**
 * Platform admin & operations shell (F-23). Super-admin only — gated server-side.
 * Not tenant-scoped: super-admins are platform-level and ops functions are
 * cross-tenant.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSuperAdmin(); // 404s for everyone else

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="font-semibold tracking-tight">
              Operations
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              ← Platform
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</div>
    </div>
  );
}
