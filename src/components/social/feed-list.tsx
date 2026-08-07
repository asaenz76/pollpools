"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadMoreFeedAction } from "@/lib/domain/feed-actions";
import type { FeedItem, FeedCursor } from "@/features/social/get-feed";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Keyset-paginated feed list (F-18). "Load more" fetches the next page by cursor
 * and appends — no OFFSET, so rows are never skipped or duplicated as new activity
 * arrives. Deduplicates defensively by id.
 */
export function FeedList({
  tenantSlug,
  initialItems,
  initialCursor,
}: {
  tenantSlug: string;
  initialItems: FeedItem[];
  initialCursor: FeedCursor | null;
}) {
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [cursor, setCursor] = useState<FeedCursor | null>(initialCursor);
  const [pending, start] = useTransition();

  const loadMore = () =>
    start(async () => {
      if (!cursor) return;
      const page = await loadMoreFeedAction(tenantSlug, cursor);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(page.nextCursor);
    });

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const inner = (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-3">
              <span className="min-w-0 text-sm">{it.text}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{timeAgo(it.createdAt)}</span>
            </div>
          );
          return <li key={it.id}>{it.href ? <Link href={it.href} className="block hover:opacity-90">{inner}</Link> : inner}</li>;
        })}
      </ul>
      {cursor ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={loadMore} className="self-center">
          {pending ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
