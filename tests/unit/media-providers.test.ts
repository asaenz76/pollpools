import { describe, it, expect } from "vitest";
import {
  resolveMediaProvider,
  providerForUrl,
  mediaProviderById,
  validateHttpUrl,
  SUPPORTED_MEDIA_PROVIDERS,
} from "@/lib/providers/media";

const u = (s: string) => new URL(s);

describe("media provider registry", () => {
  it("lists the platforms the brief requires", () => {
    for (const id of ["youtube", "tiktok", "twitch", "kick", "facebook", "instagram", "external", "other"]) {
      expect(SUPPORTED_MEDIA_PROVIDERS).toContain(id);
    }
  });

  it("detects the provider from the URL host", () => {
    expect(providerForUrl(u("https://www.youtube.com/watch?v=abc")).id).toBe("youtube");
    expect(providerForUrl(u("https://youtu.be/abc")).id).toBe("youtube");
    expect(providerForUrl(u("https://www.tiktok.com/@x/live")).id).toBe("tiktok");
    expect(providerForUrl(u("https://kick.com/someone")).id).toBe("kick");
    expect(providerForUrl(u("https://example.com/live")).id).toBe("external");
  });

  it("only YouTube embeds inline; everyone else degrades to an external link", () => {
    const yt = resolveMediaProvider({ url: u("https://www.youtube.com/watch?v=aqz-KE-bpKQ") });
    expect(yt.canEmbed).toBe(true);
    expect(yt.embedUrl(u("https://www.youtube.com/watch?v=aqz-KE-bpKQ"))).toContain("youtube-nocookie.com");
    expect(yt.thumbnailUrl(u("https://www.youtube.com/watch?v=aqz-KE-bpKQ"))).toContain("aqz-KE-bpKQ");

    for (const id of ["tiktok", "twitch", "kick", "facebook", "instagram", "external"]) {
      const p = mediaProviderById(id);
      expect(p.canEmbed).toBe(false);
      expect(p.embedUrl(u("https://example.com"))).toBeNull();
      expect(p.thumbnailUrl(u("https://example.com"))).toBeNull();
    }
  });

  it("every provider exposes a label and an icon", () => {
    for (const id of SUPPORTED_MEDIA_PROVIDERS) {
      const p = mediaProviderById(id);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.icon.length).toBeGreaterThan(0);
    }
  });

  it("trusts a known provider hint but falls back to detection for unknown hints", () => {
    // Known hint wins even if the URL is generic.
    expect(resolveMediaProvider({ url: u("https://example.com"), providerId: "twitch" }).id).toBe("twitch");
    // Unknown hint → detect from URL.
    expect(resolveMediaProvider({ url: u("https://kick.com/x"), providerId: "mystery" }).id).toBe("kick");
    // No URL, no known hint → external.
    expect(resolveMediaProvider({}).id).toBe("external");
  });

  it("shares http(s)-only validation", () => {
    expect(validateHttpUrl("https://youtube.com/watch?v=abc").ok).toBe(true);
    expect(validateHttpUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateHttpUrl("").ok).toBe(false);
  });
});
