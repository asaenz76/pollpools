import { describe, it, expect } from "vitest";
import { getEngineBehavior } from "@/lib/engine/behavior";
import { SUPPORTED_ENGINE_VERSIONS, isSupportedEngineVersion } from "@/lib/engine/version";
import { getLockState, lockDisplayState } from "@/lib/domain/locking";

describe("engine version support", () => {
  it("supports 1.0 and 1.1", () => {
    expect(SUPPORTED_ENGINE_VERSIONS).toContain("1.0");
    expect(SUPPORTED_ENGINE_VERSIONS).toContain("1.1");
    expect(isSupportedEngineVersion("1.1")).toBe(true);
    expect(isSupportedEngineVersion("9.9")).toBe(false);
  });
});

describe("getEngineBehavior", () => {
  it("1.0 disables the closing-soon display state", () => {
    expect(getEngineBehavior("1.0").lockClosingSoonMs).toBeNull();
  });
  it("1.1 shows closing-soon within 15 minutes", () => {
    expect(getEngineBehavior("1.1").lockClosingSoonMs).toBe(15 * 60 * 1000);
  });
});

describe("lockDisplayState (version-gated, display only)", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const lockIn = (min: number) =>
    getLockState({ marketStatus: "open", marketLocksAt: new Date(now.getTime() + min * 60_000), now });

  it("1.0 never shows closing-soon — only open / locked", () => {
    const b = getEngineBehavior("1.0");
    expect(lockDisplayState(lockIn(5), b.lockClosingSoonMs)).toBe("open");
    expect(lockDisplayState(lockIn(120), b.lockClosingSoonMs)).toBe("open");
  });

  it("1.1 shows closing-soon inside the window but open outside it", () => {
    const b = getEngineBehavior("1.1");
    expect(lockDisplayState(lockIn(5), b.lockClosingSoonMs)).toBe("closing_soon");
    expect(lockDisplayState(lockIn(30), b.lockClosingSoonMs)).toBe("open");
  });

  it("a locked market reads locked under every version", () => {
    const locked = getLockState({ marketStatus: "locked", marketLocksAt: null, now });
    expect(lockDisplayState(locked, getEngineBehavior("1.0").lockClosingSoonMs)).toBe("locked");
    expect(lockDisplayState(locked, getEngineBehavior("1.1").lockClosingSoonMs)).toBe("locked");
  });
});
