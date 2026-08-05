import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { getSessionUser } from "@/lib/auth/session";
import { getNotifications } from "@/features/social/get-notifications";
import { MarkAllReadButton } from "@/components/domain/mark-read-button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const ctx = await getTenantContext();
  if (!ctx) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/t/${ctx.tenant.slug}/sign-in`);

  const notifications = await getNotifications();
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <div className="grid gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <MarkAllReadButton hasUnread={hasUnread} />
      </header>

      {notifications.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>You&apos;re all caught up</CardTitle>
            <CardDescription>Results, achievements, and follows will appear here.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {notifications.map((n) => {
            const href = n.entityType === "event" && n.entityId ? `/t/${ctx.tenant.slug}/feed` : null;
            const inner = (
              <div
                className={cn(
                  "rounded-md border px-3 py-3",
                  n.read ? "border-border bg-card" : "border-primary/40 bg-muted/40",
                )}
              >
                <p className="text-sm font-medium">{n.title}</p>
                {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
              </div>
            );
            return <li key={n.id}>{href ? <Link href={href}>{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
