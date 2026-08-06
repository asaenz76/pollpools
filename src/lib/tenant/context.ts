import "server-only";

import { cache } from "react";
import { z } from "zod";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { FeatureFlagService } from "@/lib/tenant/feature-flags";
import { getPlatformConfig } from "@/lib/config/platform";
import { resolveEngineVersion, type EngineVersion } from "@/lib/engine/version";
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

export type TenantSettings = {
  sentimentVisibility: SentimentVisibility;
  smallParticipationDisplay: boolean;
  minimumRankedPredictions: number;
  platformShareBps: number;
  creatorShareBps: number;
  legalLinks: NavLink[];
  footerLinks: NavLink[];
};

export type TenantContext = {
  tenant: Tenant;
  settings: TenantSettings;
  features: FeatureFlagService;
};

// Non-monetary defaults for a tenant with no settings row. The revenue split is
// NOT hard-coded here — it is resolved from the platform default (platform_config)
// at use, so there is a single source of truth for the split (finding F-11).
const DEFAULT_SETTINGS_BASE = {
  sentimentVisibility: "always" as SentimentVisibility,
  smallParticipationDisplay: true,
  minimumRankedPredictions: 5,
  legalLinks: [] as NavLink[],
  footerLinks: [] as NavLink[],
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
        "sentiment_visibility, small_participation_display, minimum_ranked_predictions, platform_share_bps, creator_share_bps, legal_links, footer_links",
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
    };
  } else {
    const platform = await getPlatformConfig();
    settings = {
      ...DEFAULT_SETTINGS_BASE,
      platformShareBps: platform.defaultPlatformShareBps,
      creatorShareBps: platform.defaultCreatorShareBps,
    };
  }

  const features = FeatureFlagService.fromRows(flagRows ?? []);

  return { tenant, settings, features };
});
