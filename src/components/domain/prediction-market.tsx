"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { submitPrediction } from "@/lib/domain/predictions";
import { getLockState, formatCountdown } from "@/lib/domain/locking";
import { sentimentLabel, type Sentiment } from "@/lib/domain/sentiment";
import type { MarketStatus } from "@/types/enums";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

type Option = { id: string; label: string; color: string | null };

export type PredictionMarketProps = {
  marketId: string;
  question: string;
  marketStatus: MarketStatus;
  effectiveLocksAt: string | null;
  options: Option[];
  sentiment: Sentiment;
  userOptionId: string | null;
  signedIn: boolean;
  smallParticipationDisplay: boolean;
  smallThreshold: number;
  signInHref: string;
  settled: boolean;
  winningOptionId: string | null;
  userOutcome: "correct" | "incorrect" | "void" | null;
};

export function PredictionMarket(props: PredictionMarketProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(props.userOptionId);
  const [error, setError] = useState<string | null>(null);

  // Display-only lock state (client clock). The server is authoritative; if it
  // disagrees, submit returns a lock error which we surface.
  const lock = useMemo(
    () =>
      getLockState({
        marketStatus: props.marketStatus,
        marketLocksAt: props.effectiveLocksAt,
        now: new Date(),
      }),
    [props.marketStatus, props.effectiveLocksAt],
  );

  const votesById = useMemo(
    () => new Map(props.sentiment.results.map((r) => [r.optionId, r])),
    [props.sentiment],
  );

  function choose(optionId: string) {
    if (!props.signedIn || !lock.isOpen || pending) return;
    if (optionId === selected) return;
    setError(null);
    const previous = selected;
    setSelected(optionId);
    startTransition(async () => {
      const key =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const res = await submitPrediction({ marketId: props.marketId, optionId, idempotencyKey: key });
      if (!res.ok) {
        setSelected(previous);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">{props.question}</h3>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-xs",
            props.settled ? "text-muted-foreground" : lock.isOpen ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {props.settled
            ? "Settled"
            : lock.isOpen
              ? lock.effectiveLocksAt
                ? `Locks in ${formatCountdown(lock.msUntilLock)}`
                : "Open"
              : "Locked"}
        </span>
      </div>

      {props.settled && props.userOutcome ? (
        <div
          className={cn(
            "mb-3 rounded-md border px-3 py-2 text-sm font-medium",
            props.userOutcome === "correct"
              ? "border-positive/40 text-positive"
              : props.userOutcome === "incorrect"
                ? "border-negative/40 text-negative"
                : "border-border text-muted-foreground",
          )}
        >
          {props.userOutcome === "correct"
            ? "You called it right."
            : props.userOutcome === "incorrect"
              ? "Not this time."
              : "This market was voided."}
        </div>
      ) : null}

      <ul className="grid gap-2">
        {props.options.map((o) => {
          const r = votesById.get(o.id);
          const percentage = r?.percentage ?? 0;
          const isPicked = selected === o.id;
          const isWinner = props.settled && props.winningOptionId === o.id;
          const isPickedLoser = props.settled && isPicked && !isWinner && props.userOutcome === "incorrect";
          const interactive = props.signedIn && lock.isOpen && !pending && !props.settled;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => choose(o.id)}
                disabled={!interactive}
                aria-pressed={isPicked}
                className={cn(
                  "relative w-full overflow-hidden rounded-md border px-3 py-3 text-left transition-colors",
                  isWinner
                    ? "border-positive"
                    : isPickedLoser
                      ? "border-negative"
                      : isPicked
                        ? "border-primary"
                        : "border-border",
                  interactive ? "hover:bg-muted cursor-pointer" : "cursor-default",
                )}
              >
                {/* Community sentiment bar. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-muted"
                  style={{ width: `${percentage}%` }}
                />
                <span className="relative flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium">
                    {isWinner ? (
                      <Check className="size-4 text-positive" />
                    ) : isPicked ? (
                      <Check className={cn("size-4", isPickedLoser ? "text-negative" : "text-primary")} />
                    ) : null}
                    {o.label}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {props.sentiment.hasPredictions
                      ? sentimentLabel(
                          r ?? { optionId: o.id, label: o.label, votes: 0, percentage: 0 },
                          props.sentiment.total,
                          {
                            smallParticipationDisplay: props.smallParticipationDisplay,
                            smallThreshold: props.smallThreshold,
                          },
                        )
                      : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 min-h-5 text-sm">
        {error ? <span className="text-negative">{error}</span> : null}
        {!error && !props.sentiment.hasPredictions ? (
          <span className="text-muted-foreground">No community sentiment yet.</span>
        ) : null}
        {!error && props.sentiment.hasPredictions ? (
          <span className="text-muted-foreground">
            {props.sentiment.total} {props.sentiment.total === 1 ? "prediction" : "predictions"}
          </span>
        ) : null}
      </div>

      {!props.signedIn && !props.settled && lock.isOpen ? (
        <Link href={props.signInHref} className={cn(buttonVariants({ variant: "primary", size: "sm" }), "mt-3 w-full")}>
          Sign in to predict
        </Link>
      ) : null}
    </section>
  );
}
