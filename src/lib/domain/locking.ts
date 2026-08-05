/**
 * Prediction locking (spec §11).
 *
 * Server time is the single authority for whether a market accepts predictions;
 * these pure helpers are used both by the UI (to render countdowns / disable the
 * form) and mirror the gate enforced in `submit_prediction`. The client clock is
 * NEVER used to determine eligibility — callers pass a server-derived `now`.
 */

import type { MarketStatus } from "@/types/enums";

export type LockInput = {
  marketStatus: MarketStatus;
  marketLocksAt: Date | string | null;
  eventLocksAt?: Date | string | null;
  now: Date;
};

export type LockState = {
  effectiveLocksAt: Date | null;
  isOpen: boolean;
  isLocked: boolean;
  /** Milliseconds until lock; 0 if already locked or no lock time. */
  msUntilLock: number;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export function getLockState(input: LockInput): LockState {
  const effectiveLocksAt = toDate(input.marketLocksAt) ?? toDate(input.eventLocksAt);
  const nowMs = input.now.getTime();

  const timeExpired = effectiveLocksAt != null && nowMs >= effectiveLocksAt.getTime();
  const isOpen = input.marketStatus === "open" && !timeExpired;
  const isLocked = !isOpen;

  const msUntilLock =
    effectiveLocksAt && !timeExpired ? Math.max(0, effectiveLocksAt.getTime() - nowMs) : 0;

  return { effectiveLocksAt, isOpen, isLocked, msUntilLock };
}

/** Whether a prediction may be submitted right now (mirrors the DB gate). */
export function canSubmitPrediction(input: LockInput): boolean {
  return getLockState(input).isOpen;
}

/** Compact countdown string for a lock time, e.g. "2d 3h", "5m", "Locked". */
export function formatCountdown(msUntilLock: number): string {
  if (msUntilLock <= 0) return "Locked";
  const s = Math.floor(msUntilLock / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}
