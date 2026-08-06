"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { draftCompetitorAction } from "@/lib/domain/draft-actions";
import type { DraftSection as DraftSectionData } from "@/features/draft/get-draft";
import { DraftOptionalNotice } from "@/components/domain/draft-notice";
import { CheckoutButton } from "@/components/billing/buttons";
import { DRAFT_PAID_NOTICE } from "@/lib/constants";
import { formatCountdown } from "@/lib/domain/locking";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatFee(minor: number | null, currency: string | null): string {
  if (!minor || !currency) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

export function DraftSection({
  data,
  competitionId,
  tenantSlug,
  signedIn,
  signInHref,
}: {
  data: DraftSectionData;
  competitionId: string;
  tenantSlug: string;
  signedIn: boolean;
  signInHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const paid = data.accessType === "paid";

  // Compute the countdown after mount only (Date.now is impure during render).
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const closesMs = nowMs != null && data.closesAt ? new Date(data.closesAt).getTime() - nowMs : null;

  function onDraft(competitorId: string) {
    if (!signedIn || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await draftCompetitorAction({ competitionId, competitorId });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby="draft-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="draft-heading" className="text-lg font-semibold">
          Draft your competitor
        </h2>
        {data.isOpen && data.closesAt && closesMs != null ? (
          <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
            Draft closes in {formatCountdown(closesMs)}
          </span>
        ) : !data.isOpen ? (
          <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
            {data.status === "completed" ? "Completed" : "Closed"}
          </span>
        ) : null}
      </div>

      <DraftOptionalNotice />
      {paid ? <p className="text-sm text-muted-foreground">{DRAFT_PAID_NOTICE}</p> : null}

      {error ? <p className="text-sm text-negative">{error}</p> : null}

      {/* Your competitor (after assignment) */}
      {data.userAssignment ? (
        <div className="rounded-md border border-primary/40 bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your competitor</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="font-semibold">{data.userAssignment.competitorName}</span>
            <span className="text-sm text-muted-foreground">
              {data.userAssignment.status === "pending_payment"
                ? "Payment required"
                : `${data.userPoints ?? 0} pts${data.userRank ? ` · Rank ${data.userRank}` : ""}`}
            </span>
          </div>
          {data.userAssignment.status === "pending_payment" ? (
            <div className="mt-3">
              {data.paidDraftProductId ? (
                <CheckoutButton
                  productId={data.paidDraftProductId}
                  tenantSlug={tenantSlug}
                  competitionId={competitionId}
                  draftReservationId={data.userAssignment.assignmentId}
                  label={`Complete payment — ${formatFee(data.feeMinorUnits, data.currencyCode)}`}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Paid drafting is currently unavailable.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : !signedIn ? (
        <Link href={signInHref} className={cn(buttonVariants({ variant: "primary", size: "sm" }), "w-full")}>
          Sign in to draft
        </Link>
      ) : (
        /* Available competitors */
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            Choose one competitor for the competition{paid ? ` · ${formatFee(data.feeMinorUnits, data.currencyCode)}` : ""}.
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.roster.map((r) => {
              const unavailable = data.mode === "exclusive" && r.taken;
              return (
                <li key={r.competitorId}>
                  <button
                    type="button"
                    disabled={unavailable || pending || !data.isOpen}
                    onClick={() => onDraft(r.competitorId)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                      unavailable ? "border-border text-muted-foreground" : "border-border hover:border-primary hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-3 rounded-full border border-border"
                        style={{ backgroundColor: r.color ?? "transparent" }}
                      />
                      {r.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {unavailable ? "Already drafted" : data.mode === "open" && r.drafters > 0 ? `${r.drafters} drafting` : "Available"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {data.roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">Competitors will appear here once events are scheduled.</p>
          ) : null}
        </div>
      )}

      {/* Draft standings */}
      {data.standings.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Draft standings</h3>
          <ul className="flex flex-col gap-1.5">
            {data.standings.slice(0, 10).map((row) => (
              <li key={row.userId} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span className="w-6 text-center font-semibold tabular-nums text-muted-foreground">{row.rank ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate">
                  {row.displayName} <span className="text-muted-foreground">· {row.competitorName}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{row.competitionPoints} pts</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Prizes */}
      {data.prizes.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Competition prizes</h3>
          <ul className="flex flex-col gap-1.5">
            {data.prizes.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{p.title}</span>
                  {p.description ? <span className="ml-1 text-muted-foreground">— {p.description}</span> : null}
                </span>
                <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{p.category}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
