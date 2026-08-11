import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser, getTenantViewer } from "@/lib/auth/session";
import { platformRoleOf } from "@/lib/auth/roles";
import { getUnreadNotificationCount } from "@/features/social/get-notifications";
import { signOutAction } from "@/lib/auth/actions";
import { Trophy } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottomNav } from "@/components/domain/bottom-nav";
import { RoleContextBar } from "@/components/domain/role-context-bar";
import { TenantLogo } from "@/components/domain/tenant-logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { resolveTenantBrand, tenantBrandCss } from "@/lib/theme/tenant-theme";

export default async function TenantLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  if (!ctx) notFound();

  const { tenant } = ctx;
  const user = await getSessionUser();
  const unread = user ? await getUnreadNotificationCount() : 0;
  // Role decides the one context-switch affordance in the header (participation is
  // the default here; operators/admins get a deliberate entry to their surfaces).
  const role = user ? platformRoleOf(await getTenantViewer(tenant.id)) : "guest";

  // Resolve this tenant's brand palette and inject it as CSS-variable overrides.
  // Server-rendered → present at first paint (no flash); values are validated hex.
  const brand = resolveTenantBrand(tenant.theme);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <style dangerouslySetInnerHTML={{ __html: tenantBrandCss(brand) }} />
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <TenantLogo href={`/t/${tenant.slug}`} displayName={tenant.displayName} logoLight={brand.logoLight} logoDark={brand.logoDark} />
          <div className="flex items-center gap-1">
            {user ? <RoleContextBar role={role} tenantSlug={tenant.slug} /> : null}
            <Link
              href={`/t/${tenant.slug}/leaderboard`}
              aria-label="Leaderboard"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <Trophy />
            </Link>
            <ThemeToggle />
            {user ? (
              <form action={signOutAction}>
                <input type="hidden" name="slug" value={tenant.slug} />
                <Button variant="ghost" size="sm" type="submit">
                  Sign out
                </Button>
              </form>
            ) : (
              <Link href={`/t/${tenant.slug}/sign-in`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</div>

      {user ? (
        <BottomNav tenantSlug={tenant.slug} unreadCount={unread} />
      ) : (
        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-6 text-xs text-muted-foreground">
            <span>
              {tenant.displayName}
              {ctx.settings.showPoweredBy ? ` · Powered by ${ctx.platformName}` : ""}
            </span>
            {/* White-label tenants (showPoweredBy=false) intentionally hide platform
                links; platform legal pages stay reachable directly at /terms, /privacy. */}
            {ctx.settings.showPoweredBy ? (
              <span className="flex gap-3">
                <Link href="/terms" className="hover:underline">Terms</Link>
                <Link href="/privacy" className="hover:underline">Privacy</Link>
                <Link href="/support" className="hover:underline">Support</Link>
              </span>
            ) : null}
          </div>
        </footer>
      )}
    </div>
  );
}
