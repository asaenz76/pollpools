"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approvePayoutAction, rejectPayoutAction, markPayoutPaidAction, type ActionResult } from "@/lib/ops/admin-actions";
import type { PayoutRequest } from "@/lib/ops/admin";

const money = (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency}`;
const statusColor = (s: string) =>
  s === "paid" ? "text-positive" : s === "rejected" || s === "canceled" ? "text-negative" : s === "approved" ? "text-primary" : "text-streak";

/**
 * One payout request row. Actions depend on status and call the existing gated
 * payout RPCs by id — the amount is never sent from the client (it was set and
 * validated at request time). Approve/Reject on a pending request; Mark paid on an
 * approved one (with an external reference).
 */
function PayoutRow({ tenantId, req }: { tenantId: string; req: PayoutRequest }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      try {
        setResult(await fn());
      } catch {
        setResult({ ok: false, message: "Action failed." });
      }
    });

  const pendingReview = req.status === "requested" || req.status === "under_review";

  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-medium">{req.creatorName ?? "Unknown creator"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {money(req.amountMinorUnits, req.currencyCode)}
            {req.method ? ` · ${req.method}` : ""}
            {req.destinationMasked ? ` · ${req.destinationMasked}` : ""}
          </span>
        </span>
        <span className={"text-xs font-medium capitalize " + statusColor(req.status)}>{req.status.replace(/_/g, " ")}</span>
      </div>

      {pendingReview ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => approvePayoutAction(tenantId, req.id))}>Approve</Button>
          </div>
          <div className="flex gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rejection reason" />
            <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => rejectPayoutAction(tenantId, req.id, reason))}>
              Reject
            </Button>
          </div>
        </div>
      ) : req.status === "approved" ? (
        <div className="mt-2 flex gap-2">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="External payment reference" />
          <Button size="sm" disabled={pending} onClick={() => run(() => markPayoutPaidAction(tenantId, req.id, reference))}>
            Mark paid
          </Button>
        </div>
      ) : req.externalReference ? (
        <p className="mt-1 text-xs text-muted-foreground">Ref: {req.externalReference}</p>
      ) : null}

      {result ? <p className={(result.ok ? "text-muted-foreground" : "text-negative") + " mt-2 text-sm"} role="status">{result.message}</p> : null}
    </li>
  );
}

export function PayoutOps({ tenantId, requests }: { tenantId: string; requests: PayoutRequest[] }) {
  if (requests.length === 0) return <p className="text-sm text-muted-foreground">No payout requests.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {requests.map((r) => (
        <PayoutRow key={r.id} tenantId={tenantId} req={r} />
      ))}
    </ul>
  );
}
