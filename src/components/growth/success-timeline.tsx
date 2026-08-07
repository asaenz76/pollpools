"use client";

import { useMemo, useState } from "react";
import type { TimelineEntry } from "@/lib/growth/dashboard";

const CATEGORY_LABELS: Record<string, string> = {
  revenue_plan: "Revenue Plans",
  community_health: "Community Health",
  audience: "Audience",
  competitions: "Competitions",
  draft: "Draft",
  support: "Support",
  platform: "Platform",
  achievements: "Achievements",
};

const ICON: Record<string, string> = {
  trophy: "🏆", users: "👥", sparkline: "📈", heart: "❤️", flag: "🚩", medal: "🥇", globe: "🌐", cake: "🎂",
};

function monthKey(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Tenant Success Timeline — celebrates positive milestones, grouped by month with
 * category filters and pinned entries. Not an activity feed or audit log. Sharing
 * ("Celebrate publicly") is architecturally supported (is_shareable_eligible) but
 * intentionally not wired up yet.
 */
export function SuccessTimeline({ entries }: { entries: TimelineEntry[] }) {
  const [filter, setFilter] = useState<string>("all");

  const categories = useMemo(() => ["all", ...Array.from(new Set(entries.map((e) => e.category)))], [entries]);
  const visible = filter === "all" ? entries : entries.filter((e) => e.category === filter);

  const groups = useMemo(() => {
    const map = new Map<string, TimelineEntry[]>();
    for (const e of visible) {
      const k = monthKey(e.occurredAt);
      (map.get(k) ?? map.set(k, []).get(k)!).push(e);
    }
    return Array.from(map.entries());
  }, [visible]);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Your milestones will appear here as your community grows.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={
              "rounded-full border px-3 py-1 text-xs transition-colors " +
              (filter === c ? "border-primary bg-primary-subtle text-foreground" : "border-border text-muted-foreground hover:text-foreground")
            }
          >
            {c === "all" ? "All" : CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </div>

      {groups.map(([month, items]) => (
        <div key={month}>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{month}</h3>
          <ul className="flex flex-col gap-2">
            {items.map((e) => (
              <li key={e.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                <span aria-hidden className="text-lg leading-none">{ICON[e.iconKey ?? ""] ?? "✨"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{e.title}</p>
                    {e.isPinned ? <span className="rounded-full border border-primary px-1.5 py-0.5 text-[10px] text-primary">Pinned</span> : null}
                  </div>
                  {e.description ? <p className="text-xs text-muted-foreground">{e.description}</p> : null}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(e.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                    {" · "}
                    {CATEGORY_LABELS[e.category] ?? e.category}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
