"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setCommentStatusAction } from "@/lib/ops/admin-actions";
import type { ModerationComment } from "@/lib/ops/admin";

const statusColor = (s: string) => (s === "visible" ? "text-positive" : s === "hidden" ? "text-streak" : "text-negative");

/**
 * Comment moderation for a tenant. Soft status transitions only (Hide / Restore /
 * Delete = visible/hidden/deleted) — the row and body are preserved for audit, and
 * the comments RLS already hides non-visible comments from the public. Each action
 * is a super-admin-gated server action.
 */
export function CommentModeration({ tenantId, comments }: { tenantId: string; comments: ModerationComment[] }) {
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = (id: string, status: "visible" | "hidden" | "deleted") => {
    setBusyId(id);
    start(async () => {
      await setCommentStatusAction(tenantId, id, status);
      setBusyId(null);
    });
  };

  if (comments.length === 0) return <p className="text-sm text-muted-foreground">No comments to moderate.</p>;

  return (
    <ul className="flex flex-col gap-2">
      {comments.map((c) => {
        const busy = pending && busyId === c.id;
        return (
          <li key={c.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{c.authorName ?? "Unknown user"}</span>
              <span className={"text-xs font-medium capitalize " + statusColor(c.status)}>{c.status}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{c.body}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {c.status !== "visible" ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(c.id, "visible")}>Restore</Button>
              ) : null}
              {c.status !== "hidden" ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(c.id, "hidden")}>Hide</Button>
              ) : null}
              {c.status !== "deleted" ? (
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => act(c.id, "deleted")}>Delete</Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
