"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { publishPollPoolAction, type PublishState } from "@/lib/domain/onboarding-actions";
import { cn } from "@/lib/utils";

const LABELS: Record<keyof PublishState["checks"], string> = {
  owner_email_verified: "Verify your email",
  name: "Add a community name",
  description: "Add a short description",
  has_published_event: "Publish your first event",
};

/**
 * "Publish your PollPool" (PL.4). Shown only while a community is unlisted. Lists
 * the objective eligibility criteria and enables the deliberate publish action once
 * they're all met — no admin approval, no Health/plan gating. Publishing adds the
 * community to platform discovery; until then it stays fully operable by direct URL.
 */
export function PublishPollPool({ tenantId, state }: { tenantId: string; state: PublishState }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const publish = () => {
    setError(null);
    start(async () => {
      const res = await publishPollPoolAction({ tenantId });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-primary/30 bg-primary-subtle p-4">
      <h2 className="text-sm font-semibold">Publish your PollPool</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Your community is unlisted — fully usable by direct link, but not yet shown in Poll Pools discovery. Finish these to publish it.
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {(Object.keys(LABELS) as (keyof PublishState["checks"])[]).map((k) => {
          const done = state.checks[k];
          return (
            <li key={k} className="flex items-center gap-2 text-sm">
              <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border text-[10px]", done ? "border-positive bg-positive/15 text-positive" : "border-border text-transparent")}>✓</span>
              <span className={done ? "text-muted-foreground line-through" : ""}>{LABELS[k]}</span>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 text-sm text-negative">{error}</p> : null}
      <div className="mt-3">
        <Button size="sm" disabled={!state.eligible || pending} onClick={publish}>
          {pending ? "Publishing…" : state.eligible ? "Publish PollPool" : "Complete the checklist to publish"}
        </Button>
      </div>
    </section>
  );
}
