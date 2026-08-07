import { describe, it, expect } from "vitest";
import { manualEventProvider, resolveEventProvider } from "@/lib/providers/event";

const CREATOR = "33333333-3333-4333-8333-333333333333";
const C1 = "44444444-4444-4444-8444-444444444444";
const C2 = "55555555-5555-4555-8555-555555555555";

const base = { creatorId: CREATOR, title: "Grand Final", competitorIds: [C1, C2] };

describe("manualEventProvider.validate", () => {
  it("normalizes a minimal event and derives a slug", () => {
    const r = manualEventProvider.validate(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("Grand Final");
      expect(r.value.slug).toMatch(/^grand-final-[a-z0-9]{5}$/);
      expect(r.value.competitorIds).toEqual([C1, C2]);
      expect(r.value.publish).toBe(true);
      expect(r.value.media).toEqual([]);
      expect(r.value.competitionId).toBeNull();
    }
  });

  it("requires at least two competitors", () => {
    const r = manualEventProvider.validate({ ...base, competitorIds: [C1] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least 2/i);
  });

  it("keeps media OPTIONAL — an event with no media is valid", () => {
    expect(manualEventProvider.validate(base).ok).toBe(true);
  });

  it("validates media urls and auto-marks a single link primary", () => {
    const r = manualEventProvider.validate({
      ...base,
      media: [{ url: "https://www.youtube.com/watch?v=abc", mediaType: "livestream" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.media).toHaveLength(1);
      expect(r.value.media[0]!.isPrimary).toBe(true);
      expect(r.value.media[0]!.provider).toBe("youtube");
    }
  });

  it("rejects a non-http media url", () => {
    const r = manualEventProvider.validate({ ...base, media: [{ url: "javascript:alert(1)" }] });
    expect(r.ok).toBe(false);
  });

  it("rejects more than one primary media link", () => {
    const r = manualEventProvider.validate({
      ...base,
      media: [
        { url: "https://a.example.com", isPrimary: true },
        { url: "https://b.example.com", isPrimary: true },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/one media link/i);
  });
});

describe("resolveEventProvider", () => {
  it("defaults to manual and rejects unimplemented ids", () => {
    expect(resolveEventProvider(null).id).toBe("manual");
    expect(() => resolveEventProvider("imported")).toThrow(/EVENT_PROVIDER_NOT_CONFIGURED/);
  });
});
