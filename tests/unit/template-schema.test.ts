import { describe, it, expect } from "vitest";
import { validateTemplateForPublish, templateConfigSchema } from "@/lib/templates/schema";

const validConfig = {
  locale: "en",
  timezone: "UTC",
  vocabulary: { competitor: { singular: "Racer", plural: "Racers" } },
  providers: { result: "manual", event: "manual", notification: ["in_app"] },
  featureFlags: { predictions_enabled: true, global_leaderboard_enabled: true },
  competitionDefaults: { draftEnabled: false },
  marketTemplates: [{ type: "SINGLE_CHOICE_WINNER", question: "Which racer will win?" }],
};

describe("validateTemplateForPublish", () => {
  it("accepts a well-formed 1.0 template", () => {
    const r = validateTemplateForPublish({ engineVersion: "1.0", configuration: validConfig });
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it("rejects an unsupported engine version", () => {
    const r = validateTemplateForPublish({ engineVersion: "9.9", configuration: validConfig });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/engine version/i);
  });

  it("rejects unknown providers, channels, and media", () => {
    expect(validateTemplateForPublish({ engineVersion: "1.0", configuration: { ...validConfig, providers: { result: "webhook" } } }).ok).toBe(false);
    expect(validateTemplateForPublish({ engineVersion: "1.0", configuration: { ...validConfig, providers: { notification: ["carrier_pigeon"] } } }).ok).toBe(false);
    expect(validateTemplateForPublish({ engineVersion: "1.0", configuration: { ...validConfig, providers: { media: "myspace" } } }).ok).toBe(false);
  });

  it("rejects unknown feature flags and vocabulary keys (no unknown keys)", () => {
    expect(templateConfigSchema.safeParse({ ...validConfig, featureFlags: { made_up_flag: true } }).success).toBe(false);
    expect(templateConfigSchema.safeParse({ ...validConfig, vocabulary: { wizard: { singular: "Wizard" } } }).success).toBe(false);
    // Strict: an unknown top-level key is rejected.
    expect(templateConfigSchema.safeParse({ ...validConfig, mystery: 1 }).success).toBe(false);
  });

  it("flags a Draft/competitor incompatibility", () => {
    const r = validateTemplateForPublish({
      engineVersion: "1.0",
      configuration: { ...validConfig, competitionDefaults: { draftEnabled: true } },
      seedDefinition: { competitors: ["only one"] },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/draft/i);
  });

  it("requires ≥2 competitors for a demo event", () => {
    const r = validateTemplateForPublish({
      engineVersion: "1.0",
      configuration: validConfig,
      seedDefinition: { event: { title: "Race 1" }, competitors: ["solo"] },
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a valid demo seed", () => {
    const r = validateTemplateForPublish({
      engineVersion: "1.0",
      configuration: validConfig,
      seedDefinition: { creator: { displayName: "Demo League" }, competitors: ["A", "B", "C"], competition: { type: "SEASON", title: "Season 1" }, event: { title: "Race 1" } },
    });
    expect(r).toEqual({ ok: true, errors: [] });
  });
});
