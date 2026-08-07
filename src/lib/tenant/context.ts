import "server-only";

import { cache } from "react";
import { z } from "zod";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { FeatureFlagService } from "@/lib/tenant/feature-flags";
import { getPlatformConfig } from "@/lib/config/platform";
import { resolveEngineVersion, type EngineVersion } from "@/lib/engine/version";
import { resolveVocabulary, DEFAULT_VOCABULARY, type Vocabulary } from "@/lib/vocabulary";
import { resolveTenantProviders, type TenantProviderManifest } from "@/lib/providers";
import { TENANT_HEADER } from "@/lib/supabase/middleware";
import type { SentimentVisibility, TenantStatus } from "@/types/enums";

/** A tenant-configured navigation link (legal/footer). */
export type NavLink = { label: string; href: string };
const navLinksSchema = z.array(z.object({ label: z.string(), href: z.string() })).catch([]);

export type Tenant = {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  description: string | null;
  status: TenantStatus;
  defaultLocale: string;
  defaultTimezone: string;
  logoUrl: string | null;
  iconUrl: string | null;
  theme: Record<string, unknown>;
  /** The engine version this tenant is pinned to (never "latest"). */
  engineVersion: EngineVersion;
};

export type MediaSettings = {
  enabled: boolean;
  optional: boolean;
  externalLinksEnabled: boolean;
  inlineEmbedsEnabled: boolean;
  /** Empty = all providers allowed. */
  allowedProviders: string[];
  preferredProvider: string | null;
};

export type TenantSettings = {
  sentimentVisibility: SentimentVisibility;
  smallParticipationDisplay: boolean;
  minimumRankedPredictions: number;
  platformShareBps: number;
  creatorShareBps: number;
  legalLinks: NavLink[];
  footerLinks: NavLink[];
  media: MediaSettings;
  /** White label: when false, hide the "Powered by <platform>" footer. */
  showPoweredBy: boolean;
};

export type TenantContext = {
  tenant: Tenant;
  settings: TenantSettings;
  features: FeatureFlagService;
  /** Tenant-configured presentation vocabulary (defaults resolved). */
  vocabulary: Vocabulary;
  /** Config-driven provider manifest (result / event / notification / media). */
  providers: TenantProviderManifest;
  /** Platform brand name for the "Powered by" footer (white label, configurable). */
  platformName: string;
};

// Non-monetary defaults for a tenant with no settings row. The revenue split is
// NOT hard-coded here — it is resolved from the platform default (platform_config)
// at use, so there is a single source of truth for the split (finding F-11).
// Media is enabled + optional by default; no preferred provider; empty allow-list
// means all providers are permitted. YouTube is deliberately NOT a default (§9).
const DEFAULT_MEDIA_SETTINGS: MediaSettings = {
  enabled: true,
  optional: true,
  externalLinksEnabled: true,
  inlineEmbedsEnabled: true,
  allowedProviders: [],
  preferredProvider: null,
};

const DEFAULT_SETTINGS_BASE = {
  sentimentVisibility: "always" as SentimentVisibility,
  smallParticipationDisplay: true,
  minimumRankedPredictions: 5,
  legalLinks: [] as NavLink[],
  footerLinks: [] as NavLink[],
  media: DEFAULT_MEDIA_SETTINGS,
  showPoweredBy: true,
};

/**
 * Load the request's tenant context, memoized for the render pass. Returns null
 * on the platform surface (apex host, no tenant path). Reads the tenant identity
 * from middleware-stamped headers — never from client-controllable input.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const h = await headers();
  const kind = h.get(TENANT_HEADER.kind);
  const value = h.get(TENANT_HEADER.value);
  if (!kind || !value) return null;

  const supabase = await createServerSupabase();

  // Resolve tenant id from slug or verified custom domain.
  let tenantId: string | null = null;
  if (kind === "slug") {
    const { data } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", value)
      .eq("status", "active")
      .maybeSingle();
    tenantId = data?.id ?? null;
  } else {
    const { data } = await supabase
      .from("tenant_domains")
      .select("tenant_id, tenants!inner(status)")
      .eq("domain", value)
      .eq("verified", true)
      .maybeSingle();
    tenantId = data?.tenant_id ?? null;
  }

  if (!tenantId) return null;

  const [{ data: tenantRow }, { data: settingsRow }, { data: flagRows }] = await Promise.all([
    supabase
      .from("tenants")
      .select(
        "id, slug, display_name, tagline, description, status, default_locale, default_timezone, logo_url, icon_url, theme, engine_version",
      )
      .eq("id", tenantId)
      .single(),
    supabase
      .from("tenant_settings")
      .select(
        "sentiment_visibility, small_participation_display, minimum_ranked_predictions, platform_share_bps, creator_share_bps, legal_links, footer_links, event_media_enabled, event_media_optional, external_media_links_enabled, inline_embeds_enabled, allowed_media_providers, preferred_media_provider, vocabulary, providers, show_powered_by",
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase.from("tenant_feature_flags").select("flag, enabled").eq("tenant_id", tenantId),
  ]);

  if (!tenantRow) return null;

  const tenant: Tenant = {
    id: tenantRow.id,
    slug: tenantRow.slug,
    displayName: tenantRow.display_name,
    tagline: tenantRow.tagline,
    description: tenantRow.description,
    status: tenantRow.status as TenantStatus,
    defaultLocale: tenantRow.default_locale,
    defaultTimezone: tenantRow.default_timezone,
    logoUrl: tenantRow.logo_url,
    iconUrl: tenantRow.icon_url,
    theme: (tenantRow.theme as Record<string, unknown>) ?? {},
    engineVersion: resolveEngineVersion(tenantRow.engine_version),
  };

  const platform = await getPlatformConfig();
  let settings: TenantSettings;
  if (settingsRow) {
    settings = {
      sentimentVisibility: settingsRow.sentiment_visibility as SentimentVisibility,
      smallParticipationDisplay: settingsRow.small_participation_display,
      minimumRankedPredictions: settingsRow.minimum_ranked_predictions,
      platformShareBps: settingsRow.platform_share_bps,
      creatorShareBps: settingsRow.creator_share_bps,
      legalLinks: navLinksSchema.parse(settingsRow.legal_links ?? []),
      footerLinks: navLinksSchema.parse(settingsRow.footer_links ?? []),
      media: {
        enabled: settingsRow.event_media_enabled,
        optional: settingsRow.event_media_optional,
        externalLinksEnabled: settingsRow.external_media_links_enabled,
        inlineEmbedsEnabled: settingsRow.inline_embeds_enabled,
        allowedProviders: settingsRow.allowed_media_providers ?? [],
        preferredProvider: settingsRow.preferred_media_provider,
      },
      showPoweredBy: settingsRow.show_powered_by,
    };
  } else {
    settings = {
      ...DEFAULT_SETTINGS_BASE,
      platformShareBps: platform.defaultPlatformShareBps,
      creatorShareBps: platform.defaultCreatorShareBps,
    };
  }

  const features = FeatureFlagService.fromRows(flagRows ?? []);
  const vocabulary = settingsRow ? resolveVocabulary(settingsRow.vocabulary) : DEFAULT_VOCABULARY;
  // Provider selection is configuration; media preference already lives in its own
  // column, folded into the manifest config here.
  const providers = resolveTenantProviders({
    ...(settingsRow?.providers && typeof settingsRow.providers === "object" ? settingsRow.providers : {}),
    media: settings.media.preferredProvider,
  });

  return { tenant, settings, features, vocabulary, providers, platformName: platform.platformName };
});
