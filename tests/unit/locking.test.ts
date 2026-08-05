import { describe, it, expect } from "vitest";
import { getLockState, canSubmitPrediction, formatCountdown } from "@/lib/domain/locking";

const now = new Date("2026-01-01T12:00:00Z");
const future = new Date("2026-01-01T13:00:00Z");
const past = new Date("2026-01-01T11:00:00Z");

describe("getLockState", () => {
  it("open with a future lock time is open", () => {
    const s = getLockState({ marketStatus: "open", marketLocksAt: future, now });
    expect(s.isOpen).toBe(true);
    expect(s.isLocked).toBe(false);
    expect(s.msUntilLock).toBe(60 * 60 * 1000);
  });

  it("open with no lock time is open indefinitely", () => {
    const s = getLockState({ marketStatus: "open", marketLocksAt: null, now });
    expect(s.isOpen).toBe(true);
    expect(s.msUntilLock).toBe(0);
  });

  it("open but past lock time is locked (server time wins)", () => {
    const s = getLockState({ marketStatus: "open", marketLocksAt: past, now });
    expect(s.isOpen).toBe(false);
    expect(s.isLocked).toBe(true);
  });

  it("exactly at lock time is locked (>= boundary)", () => {
    const s = getLockState({ marketStatus: "open", marketLocksAt: now, now });
    expect(s.isOpen).toBe(false);
  });

  it("non-open status is never open", () => {
    for (const status of ["draft", "locked", "settled", "canceled", "voided"] as const) {
      expect(getLockState({ marketStatus: status, marketLocksAt: future, now }).isOpen).toBe(false);
    }
  });

  it("falls back to event lock time when the market has none", () => {
    const s = getLockState({ marketStatus: "open", marketLocksAt: null, eventLocksAt: past, now });
    expect(s.isOpen).toBe(false);
    expect(s.effectiveLocksAt?.toISOString()).toBe(past.toISOString());
  });

  it("accepts ISO strings", () => {
    const s = getLockState({ marketStatus: "open", marketLocksAt: future.toISOString(), now });
    expect(s.isOpen).toBe(true);
  });
});

describe("canSubmitPrediction", () => {
  it("mirrors the open state", () => {
    expect(canSubmitPrediction({ marketStatus: "open", marketLocksAt: future, now })).toBe(true);
    expect(canSubmitPrediction({ marketStatus: "open", marketLocksAt: past, now })).toBe(false);
  });
});

describe("formatCountdown", () => {
  it("formats ranges", () => {
    expect(formatCountdown(0)).toBe("Locked");
    expect(formatCountdown(30 * 1000)).toBe("<1m");
    expect(formatCountdown(5 * 60 * 1000)).toBe("5m");
    expect(formatCountdown((2 * 3600 + 15 * 60) * 1000)).toBe("2h 15m");
    expect(formatCountdown((3 * 86400 + 4 * 3600) * 1000)).toBe("3d 4h");
  });
});
