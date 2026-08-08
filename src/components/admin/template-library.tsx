"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TemplateRow } from "@/lib/ops/templates-admin";

const ICONS: Record<string, string> = { compass: "🧭", shield: "🛡️", flag: "🏁", medal: "🥇", chef: "👨‍🍳" };
const statusTone = (s: string) => (s === "published" ? "text-positive" : s === "retired" ? "text-muted-foreground" : "text-streak");

/** The template library: searchable, filterable cards. */
export function TemplateLibrary({ templates }: { templates: TemplateRow[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"name" | "updated">("name");

  const categories = useMemo(() => ["all", ...Array.from(new Set(templates.map((t) => t.category)))], [templates]);

  const shown = useMemo(() => {
    let list = templates.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (status !== "all" && t.status !== status) return false;
      if (q && !`${t.name} ${t.key} ${t.description ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    list = [...list].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt)));
    return list;
  }, [templates, q, category, status, sort]);

  const sel = "rounded-md border border-border bg-card px-2 py-1.5 text-sm";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" className={sel + " min-w-[12rem] flex-1"} aria-label="Search" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={sel} aria-label="Category">
          {categories.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} aria-label="Status">
          {["all", "draft", "published", "retired"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as "name" | "updated")} className={sel} aria-label="Sort">
          <option value="name">Sort: name</option>
          <option value="updated">Sort: recently updated</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No templates match.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((t) => (
            <Link key={t.id} href={`/admin/templates/${t.id}`} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-strong">
              <div className="flex items-center justify-between">
                <span className="text-2xl" aria-hidden>{ICONS[t.iconKey ?? ""] ?? "📦"}</span>
                <span className={"text-xs font-medium capitalize " + statusTone(t.status)}>{t.status}</span>
              </div>
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{t.category} · v{t.latestVersion}</p>
              </div>
              {t.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
