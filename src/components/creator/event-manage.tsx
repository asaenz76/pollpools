"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  publishEventAction,
  lockEventAction,
  cancelEventAction,
  voidEventResultAction,
} from "@/lib/domain/creator-actions";
import type { EventStatus } from "@/types/enums";

type Confirmable = "lock" | "cancel" | "void" | null;

/**
 * Creator event-management controls. Only actions valid for the current status
 * are rendered as active controls (spec §1). The DB is the authority — a stale
 * action fails loudly and the surfaced error explains why. Settlement-gated
 * actions (Submit Result / Correct / Void) only appear when the creator has
 * settlement enabled; otherwise the result page explains admin review.
 */
export function EventManage({
  eventId,
  tenantSlug,
  status,
  settlementEnabled,
}: {
  eventId: string;
  tenantSlug: string;
  status: EventStatus;
  settlementEnabled: boolean;
}) {
  const router = useRouter();
  const base = `/t/${tenantSlug}/creator/e/${eventId}`;
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Confirmable>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Something went wrong.");
      setConfirm(null);
      router.refresh();
    });
  };

  const canEdit = status === "draft" || status === "open" || status === "locked";
  const isSettled = status === "settled";
  const isVoided = status === "voided";
  const isTerminal = status === "canceled" || isSettled || isVoided;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Link href={`${base}/edit`} className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
            Edit event
          </Link>
        ) : null}

        {status === "draft" ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => publishEventAction({ eventId }))}>
            Publish event
          </Button>
        ) : null}

        {status === "open" ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => setConfirm("lock")}>
            Lock event
          </Button>
        ) : null}

        {status === "locked" ? (
          <Link href={`${base}/result`} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
            Submit result
          </Link>
        ) : null}

        {(isSettled || isVoided) ? (
          <Link href={`${base}/result`} className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
            Correct result
          </Link>
        ) : null}

        {isSettled && settlementEnabled ? (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => setConfirm("void")}>
            Void result
          </Button>
        ) : null}

        {!isTerminal ? (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => setConfirm("cancel")}>
            Cancel event
          </Button>
        ) : null}
      </div>

      {error && !confirm ? <p className="text-sm text-negative">{error}</p> : null}

      <ConfirmDialog
        open={confirm === "lock"}
        title="Lock this event?"
        description="No new predictions will be accepted after it is locked."
        confirmLabel="Lock event"
        confirmVariant="secondary"
        pending={pending}
        error={confirm === "lock" ? error : null}
        onCancel={() => { setConfirm(null); setError(null); }}
        onConfirm={() => run(() => lockEventAction({ eventId }))}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        title="Cancel this event?"
        description="This event will no longer accept predictions and will not affect prediction statistics or leaderboards. Submitted predictions are kept for history."
        confirmLabel="Cancel event"
        confirmVariant="destructive"
        pending={pending}
        error={confirm === "cancel" ? error : null}
        onCancel={() => { setConfirm(null); setError(null); }}
        onConfirm={() => run(() => cancelEventAction({ eventId }))}
      />
      <ConfirmDialog
        open={confirm === "void"}
        title="Void this result?"
        description="Predictions will be regraded as void and no points will be awarded. The previous result stays in history."
        confirmLabel="Void result"
        confirmVariant="destructive"
        pending={pending}
        error={confirm === "void" ? error : null}
        onCancel={() => { setConfirm(null); setError(null); }}
        onConfirm={() => run(() => voidEventResultAction({ eventId }))}
      />
    </div>
  );
}
