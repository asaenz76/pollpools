/**
 * Tenant template configuration schema + validation (Phase 8-D).
 *
 * A template is a CONFIGURATION BLUEPRINT that maps onto the EXISTING tenant
 * systems — there is no second configuration system and no template-specific
 * engine branching. This module defines the config/seed shapes, validates them,
 * and runs explicit feature-compatibility checks (not a general rules engine)
 * before a version may be published.
 */
import { z } from "zod";
import { VOCABULARY_KEYS } from "@/lib/vocabulary";
import { SUPPORTED_ENGINE_VERSIONS } from "@/lib/engine/version";
import { SUPPORTED_MEDIA_PROVIDERS } from "@/lib/providers/media";
import { COMPETITION_TYPE, MARKET_TYPE, SENTIMENT_VISIBILITY } from "@/types/enums";

/** Feature flags a template may set. Unknown flags are rejected at publish. */
export const KNOWN_FEATURE_FLAGS = [
  "predictions_enabled",
  "comments_enabled",
  "likes_enabled",
  "sharing_enabled",
  "creator_following_enabled",
  "achievements_enabled",
  "global_leaderboard_enabled",
  "creator_leaderboards_enabled",
  "season_leaderboards_enabled",
  "platform_premium_enabled",
  "creator_support_enabled",
  "sponsorships_enabled",
  "prediction_editing_before_lock_enabled",
  "public_profiles_enabled",
  "youtube_embeds_enabled",
] as const;

export const TEMPLATE_CATEGORIES = ["general", "sports", "racing", "entertainment", "competitions", "other"] as const;

const vocabTerm = z.object({ singular: z.string().min(1).max(60).optional(), plural: z.string().min(1).max(60).optional() });

const mediaSettings = z
  .object({
    enabled: z.boolean().optional(),
    optional: z.boolean().optional(),
    externalLinksEnabled: z.boolean().optional(),
    inlineEmbedsEnabled: z.boolean().optional(),
    allowedProviders: z.array(z.string()).optional(),
    preferredProvider: z.string().nullable().optional(),
  })
  .strict();

export const templateConfigSchema = z
  .object({
    locale: z.string().min(2).max(10).default("en"),
    timezone: z.string().min(1).max(64).default("UTC"),
    tagline: z.string().max(200).optional(),
    description: z.string().max(1000).optional(),
    vocabulary: z.record(z.enum(VOCABULARY_KEYS), vocabTerm).optional(),
    theme: z
      .object({
        brandPrimary: z.string().optional(),
        brandSecondary: z.string().optional(),
        brandAccent: z.string().optional(),
        brandDeep: z.string().optional(),
      })
      .strict()
      .optional(),
    logoUrl: z.string().url().nullable().optional(),
    iconUrl: z.string().url().nullable().optional(),
    settings: z
      .object({
        sentimentVisibility: z.enum(SENTIMENT_VISIBILITY).optional(),
        smallParticipationDisplay: z.boolean().optional(),
        minimumRankedPredictions: z.number().int().min(0).max(1000).optional(),
        showPoweredBy: z.boolean().optional(),
        media: mediaSettings.optional(),
      })
      .strict()
      .optional(),
    enabledCompetitionTypes: z.array(z.enum(COMPETITION_TYPE)).optional(),
    providers: z
      .object({
        result: z.string().optional(),
        event: z.string().optional(),
        notification: z.array(z.string()).optional(),
        media: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
    featureFlags: z.record(z.enum(KNOWN_FEATURE_FLAGS), z.boolean()).optional(),
    competitionDefaults: z.object({ draftEnabled: z.boolean().optional() }).strict().optional(),
    marketTemplates: z.array(z.object({ type: z.enum(MARKET_TYPE), question: z.string().max(200).optional() }).strict()).max(10).optional(),
    revenue: z.object({ creatorSupport: z.boolean().optional(), competitorDraft: z.boolean().optional() }).strict().optional(),
  })
  .strict();

export type TemplateConfig = z.infer<typeof templateConfigSchema>;

export const seedDefinitionSchema = z
  .object({
    creator: z.object({ displayName: z.string().min(1).max(120) }).strict().optional(),
    competitors: z.array(z.string().min(1).max(120)).max(64).optional(),
    competition: z.object({ type: z.enum(COMPETITION_TYPE), title: z.string().min(1).max(120) }).strict().optional(),
    event: z.object({ title: z.string().min(1).max(120), question: z.string().max(200).optional() }).strict().optional(),
  })
  .strict();

export type SeedDefinition = z.infer<typeof seedDefinitionSchema>;

export type ValidationResult = { ok: boolean; errors: string[] };

/**
 * Full pre-publish validation: schema + explicit feature-compatibility checks.
 * Returns every problem so the Super Admin can fix them before publishing.
 */
export function validateTemplateForPublish(input: {
  engineVersion: string;
  configuration: unknown;
  seedDefinition?: unknown;
}): ValidationResult {
  const errors: string[] = [];

  if (!(SUPPORTED_ENGINE_VERSIONS as readonly string[]).includes(input.engineVersion)) {
    errors.push(`Unsupported engine version "${input.engineVersion}".`);
  }

  const parsed = templateConfigSchema.safeParse(input.configuration);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`config.${issue.path.join(".")}: ${issue.message}`);
    return { ok: false, errors }; // can't run compatibility checks on an invalid shape
  }
  const cfg = parsed.data;

  let seed: SeedDefinition | undefined;
  if (input.seedDefinition != null) {
    const seedParsed = seedDefinitionSchema.safeParse(input.seedDefinition);
    if (!seedParsed.success) {
      for (const issue of seedParsed.error.issues) errors.push(`seed.${issue.path.join(".")}: ${issue.message}`);
    } else {
      seed = seedParsed.data;
    }
  }

  // Providers referenced must exist in the registries.
  if (cfg.providers?.result && cfg.providers.result !== "manual") errors.push(`Unsupported result provider "${cfg.providers.result}".`);
  if (cfg.providers?.event && cfg.providers.event !== "manual") errors.push(`Unsupported event provider "${cfg.providers.event}".`);
  const KNOWN_CHANNELS = ["in_app", "email", "sms", "push", "discord", "slack", "webhook", "whatsapp"];
  for (const c of cfg.providers?.notification ?? []) {
    if (!KNOWN_CHANNELS.includes(c)) errors.push(`Unknown notification channel "${c}".`);
  }
  if (cfg.providers?.media && !(SUPPORTED_MEDIA_PROVIDERS as readonly string[]).includes(cfg.providers.media)) {
    errors.push(`Unknown media provider "${cfg.providers.media}".`);
  }
  const preferred = cfg.settings?.media?.preferredProvider;
  if (preferred && !(SUPPORTED_MEDIA_PROVIDERS as readonly string[]).includes(preferred)) {
    errors.push(`Unknown preferred media provider "${preferred}".`);
  }

  // Draft compatibility: if the demo enables Draft, the seed must provide competitors.
  if (cfg.competitionDefaults?.draftEnabled && seed && (seed.competitors?.length ?? 0) < 2) {
    errors.push("Draft is enabled but the demo seed has fewer than 2 competitors to draft.");
  }

  // Revenue eligibility must map to a real, shareable revenue source.
  if (cfg.revenue?.competitorDraft && cfg.featureFlags && cfg.featureFlags["predictions_enabled"] === false) {
    errors.push("Competitor Draft revenue requires predictions to be enabled.");
  }

  // A demo event needs at least 2 competitors for a winner market.
  if (seed?.event && (seed.competitors?.length ?? 0) < 2) {
    errors.push("The demo event needs at least 2 competitors.");
  }

  return { ok: errors.length === 0, errors };
}
