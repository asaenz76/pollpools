"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Newspaper, Trophy, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mobile-first bottom navigation for signed-in users (spec §24). */
export function BottomNav({ tenantSlug, unreadCount }: { tenantSlug: string; unreadCount: number }) {
  const pathname = usePathname();
  const base = `/t/${tenantSlug}`;
  const items = [
    { href: base, label: "Home", icon: Home, match: (p: string) => p === base },
    { href: `${base}/feed`, label: "Feed", icon: Newspaper, match: (p: string) => p.startsWith(`${base}/feed`) },
    { href: `${base}/leaderboard`, label: "Ranks", icon: Trophy, match: (p: string) => p.startsWith(`${base}/leaderboard`) },
    { href: `${base}/notifications`, label: "Alerts", icon: Bell, match: (p: string) => p.startsWith(`${base}/notifications`), badge: unreadCount },
    { href: `${base}/me`, label: "You", icon: User, match: (p: string) => p.startsWith(`${base}/me`) || p.startsWith(`${base}/u/`) },
  ];

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 border-t border-border bg-card/90 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-2xl items-stretch justify-between px-2">
        {items.map((it) => {
          const active = it.match(pathname);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-xs",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {it.badge && it.badge > 0 ? (
                <span className="absolute right-1/2 top-1 translate-x-3 rounded-full bg-negative px-1 text-[10px] font-semibold leading-4 text-negative-foreground">
                  {it.badge > 9 ? "9+" : it.badge}
                </span>
              ) : null}
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
