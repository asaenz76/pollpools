import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getUnreadNotificationCount } from "@/features/social/get-notifications";
import { signOutAction } from "@/lib/auth/actions";
import { Trophy } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottomNav } from "@/components/domain/bottom-nav";
import { Button, buttonVariants } from "@/components/ui/button";

export default async function TenantLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  if (!ctx) notFound();

  const { tenant } = ctx;
  const user = await getSessionUser();
  const unread = user ? await getUnreadNotificationCount() : 0;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
          <Link href={`/t/${tenant.slug}`} className="font-semibold tracking-tight">
            {tenant.displayName}
          </Link>
          <div className="flex items-center gap-1">
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
          <div className="mx-auto w-full max-w-2xl px-4 py-6 text-xs text-muted-foreground">
            {tenant.displayName} · Powered by Prediction Engine
          </div>
        </footer>
      )}
    </div>
  );
}
