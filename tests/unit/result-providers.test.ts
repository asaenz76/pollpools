import { describe, it, expect } from "vitest";
import { manualResultProvider, resolveResultProvider } from "@/lib/providers/result";

const OPT = "11111111-1111-4111-8111-111111111111";
const COMP = "22222222-2222-4222-8222-222222222222";

describe("manualResultProvider.validate", () => {
  it("normalizes a winning-option submission", () => {
    const r = manualResultProvider.validate({ winningOptionIds: [OPT], notes: "  gg  ", resultUrl: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        winningOptionIds: [OPT],
        winningCompetitorId: null,
        notes: "gg",
        resultUrl: null,
      });
    }
  });

  it("accepts a competitor-only submission (back-compat)", () => {
    const r = manualResultProvider.validate({ winningCompetitorId: COMP });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.winningCompetitorId).toBe(COMP);
      expect(r.value.winningOptionIds).toEqual([]);
    }
  });

  it("requires either an option or a competitor", () => {
    const r = manualResultProvider.validate({ notes: "nothing selected" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/select the result/i);
  });

  it("rejects non-uuid option ids and bad urls", () => {
    expect(manualResultProvider.validate({ winningOptionIds: ["nope"] }).ok).toBe(false);
    expect(manualResultProvider.validate({ winningOptionIds: [OPT], resultUrl: "not-a-url" }).ok).toBe(false);
  });

  it("keeps a valid result url", () => {
    const r = manualResultProvider.validate({ winningOptionIds: [OPT], resultUrl: "https://example.com/r" });
    expect(r.ok && r.value.resultUrl).toBe("https://example.com/r");
  });
});

describe("resolveResultProvider", () => {
  it("defaults to manual", () => {
    expect(resolveResultProvider(null).id).toBe("manual");
    expect(resolveResultProvider("manual").id).toBe("manual");
  });

  it("throws a clear error for a recognized-but-unimplemented provider", () => {
    expect(() => resolveResultProvider("webhook")).toThrow(/RESULT_PROVIDER_NOT_CONFIGURED/);
  });
});
