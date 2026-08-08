import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/ops/admin";
import type { TemplateConfig } from "@/lib/templates/schema";

/**
 * Super-admin template library read layer (Phase 8-D 8D.4). Reads templates and
 * their versions for the admin UI and the create-tenant flow. Super-admin gated.
 */
export type TemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  latestVersion: number;
  iconKey: string | null;
  updatedAt: string;
};

export async function listTemplates(): Promise<TemplateRow[]> {
  await requireSuperAdmin();
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("tenant_templates")
    .select("id, key, name, description, category, status, latest_version, icon_key, updated_at")
    .order("name");
  return (data ?? []).map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    description: t.description,
    category: t.category,
    status: t.status,
    latestVersion: t.latest_version,
    iconKey: t.icon_key,
    updatedAt: t.updated_at,
  }));
}

export type TemplateVersionRow = {
  id: string;
  version: number;
  engineVersion: string;
  published: boolean;
  publishedAt: string | null;
  changelog: string | null;
  configuration: TemplateConfig;
  hasSeed: boolean;
};

export type TemplateDetail = TemplateRow & { versions: TemplateVersionRow[] };

export async function getTemplateDetail(templateId: string): Promise<TemplateDetail | null> {
  await requireSuperAdmin();
  const admin = createAdminSupabase();
  const { data: t } = await admin
    .from("tenant_templates")
    .select("id, key, name, description, category, status, latest_version, icon_key, updated_at")
    .eq("id", templateId)
    .maybeSingle();
  if (!t) return null;
  const { data: versions } = await admin
    .from("tenant_template_versions")
    .select("id, version, engine_version, published_at, changelog, configuration, seed_definition")
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  return {
    id: t.id,
    key: t.key,
    name: t.name,
    description: t.description,
    category: t.category,
    status: t.status,
    latestVersion: t.latest_version,
    iconKey: t.icon_key,
    updatedAt: t.updated_at,
    versions: (versions ?? []).map((v) => ({
      id: v.id,
      version: v.version,
      engineVersion: v.engine_version,
      published: v.published_at !== null,
      publishedAt: v.published_at,
      changelog: v.changelog,
      configuration: (v.configuration ?? {}) as TemplateConfig,
      hasSeed: v.seed_definition !== null,
    })),
  };
}

/** The latest PUBLISHED version of a template (for preview + create-tenant). */
export async function getPublishedVersion(templateId: string): Promise<TemplateVersionRow | null> {
  const detail = await getTemplateDetail(templateId);
  if (!detail) return null;
  return detail.versions.find((v) => v.published) ?? null;
}
