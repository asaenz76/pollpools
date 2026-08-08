"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { validateTemplateForPublish, TEMPLATE_CATEGORIES } from "@/lib/templates/schema";

/**
 * Super-admin template lifecycle + create-tenant actions (Phase 8-D). Editing is
 * only ever allowed on DRAFT versions (the DB also enforces published-version
 * immutability). Publishing runs full validation. All mutations are super-admin
 * gated and audited.
 */
export type ActionResult = { ok: boolean; message: string };
export type CreateResult = ActionResult & { slug?: string; tenantId?: string };

async function assertSuperAdmin(): Promise<void> {
  if (!(await isSuperAdmin())) throw new Error("NOT_AUTHORIZED");
}
async function audit(action: string, entityId: string | null, summary: string, metadata: Record<string, unknown> = {}) {
  const supabase = await createServerSupabase();
  await supabase.rpc("log_growth_change", { p_action: action, p_entity_type: "tenant_template", p_entity_id: entityId, p_summary: summary, p_metadata: metadata } as never);
}

export async function createTemplateAction(input: { key: string; name: string; description?: string; category: string; iconKey?: string }): Promise<ActionResult> {
  await assertSuperAdmin();
  const key = input.key.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,40}$/.test(key)) return { ok: false, message: "Key must be 2–40 chars: a–z, 0–9, underscore." };
  if (!input.name.trim()) return { ok: false, message: "Name is required." };
  if (!(TEMPLATE_CATEGORIES as readonly string[]).includes(input.category)) return { ok: false, message: "Invalid category." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tenant_templates")
    .insert({ key, name: input.name.trim(), description: input.description?.trim() || null, category: input.category, status: "draft", icon_key: input.iconKey?.trim() || null } as never)
    .select("id")
    .single();
  if (error) return { ok: false, message: error.code === "23505" ? "A template with that key already exists." : "Couldn't create the template." };
  await audit("template.created", data!.id, `Template ${key} created`);
  revalidatePath("/admin/templates");
  return { ok: true, message: `Template ${key} created (draft).` };
}

export async function createDraftVersionAction(templateId: string, copyFromVersion?: number): Promise<ActionResult> {
  await assertSuperAdmin();
  const supabase = await createServerSupabase();
  const { data: existing } = await supabase.from("tenant_template_versions").select("version, engine_version, configuration, seed_definition").eq("template_id", templateId).order("version", { ascending: false });
  const next = (existing?.[0]?.version ?? 0) + 1;
  const source = copyFromVersion != null ? existing?.find((v) => v.version === copyFromVersion) : undefined;
  const { error } = await supabase.from("tenant_template_versions").insert({
    template_id: templateId,
    version: next,
    engine_version: source?.engine_version ?? "1.0",
    configuration: (source?.configuration ?? { locale: "en", timezone: "UTC" }) as never,
    seed_definition: (source?.seed_definition ?? null) as never,
  } as never);
  if (error) return { ok: false, message: "Couldn't create the draft version." };
  await audit("template.version_drafted", templateId, `Draft v${next} created${source ? ` (copied v${copyFromVersion})` : ""}`);
  revalidatePath(`/admin/templates/${templateId}`);
  return { ok: true, message: `Draft v${next} created.` };
}

export async function saveDraftConfigAction(input: { templateId: string; versionId: string; engineVersion: string; configurationJson: string; seedJson: string; changelog?: string }): Promise<ActionResult> {
  await assertSuperAdmin();
  let configuration: unknown;
  let seedDefinition: unknown = null;
  try {
    configuration = JSON.parse(input.configurationJson);
  } catch {
    return { ok: false, message: "Configuration is not valid JSON." };
  }
  if (input.seedJson.trim()) {
    try {
      seedDefinition = JSON.parse(input.seedJson);
    } catch {
      return { ok: false, message: "Seed definition is not valid JSON." };
    }
  }
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("tenant_template_versions")
    .update({ engine_version: input.engineVersion, configuration: configuration as never, seed_definition: seedDefinition as never, changelog: input.changelog?.trim() || null } as never)
    .eq("id", input.versionId);
  if (error) return { ok: false, message: error.message.includes("IMMUTABLE") ? "Published versions cannot be edited — create a new version." : "Couldn't save the draft." };
  revalidatePath(`/admin/templates/${input.templateId}`);
  return { ok: true, message: "Draft saved." };
}

export async function publishVersionAction(templateId: string, versionId: string): Promise<ActionResult> {
  await assertSuperAdmin();
  const supabase = await createServerSupabase();
  const { data: v } = await supabase.from("tenant_template_versions").select("version, engine_version, configuration, seed_definition, published_at").eq("id", versionId).single();
  if (!v) return { ok: false, message: "Version not found." };
  if (v.published_at) return { ok: false, message: "Already published." };

  const validation = validateTemplateForPublish({ engineVersion: v.engine_version, configuration: v.configuration, seedDefinition: v.seed_definition });
  if (!validation.ok) return { ok: false, message: `Validation failed: ${validation.errors.slice(0, 3).join("; ")}` };

  const { error } = await supabase.from("tenant_template_versions").update({ published_at: new Date().toISOString() } as never).eq("id", versionId);
  if (error) return { ok: false, message: "Couldn't publish." };
  await supabase.from("tenant_templates").update({ status: "published", latest_version: v.version } as never).eq("id", templateId);
  await audit("template.version_published", templateId, `Published v${v.version}`, { version: v.version });
  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath("/admin/templates");
  return { ok: true, message: `Published v${v.version}. It is now immutable.` };
}

export async function retireTemplateAction(templateId: string): Promise<ActionResult> {
  await assertSuperAdmin();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("tenant_templates").update({ status: "retired" } as never).eq("id", templateId);
  if (error) return { ok: false, message: "Couldn't retire the template." };
  await audit("template.retired", templateId, "Template retired");
  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  return { ok: true, message: "Template retired. Existing tenants are unaffected." };
}

export async function createTenantFromTemplateAction(input: {
  templateVersionId: string;
  slug: string;
  displayName: string;
  locale?: string;
  timezone?: string;
  overrides?: Record<string, unknown>;
  includeDemo: boolean;
}): Promise<CreateResult> {
  await assertSuperAdmin();
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/.test(slug)) return { ok: false, message: "Slug must be lowercase letters, numbers, and hyphens." };
  if (!input.displayName.trim()) return { ok: false, message: "Display name is required." };
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("create_tenant_from_template", {
    p_template_version_id: input.templateVersionId,
    p_identity: { slug, display_name: input.displayName.trim(), locale: input.locale || null, timezone: input.timezone || null },
    p_overrides: input.overrides ?? {},
    p_include_demo: input.includeDemo,
  } as never);
  if (error) {
    const m = error.message;
    if (m.includes("SLUG_TAKEN")) return { ok: false, message: "That slug is already taken." };
    if (m.includes("TEMPLATE_NOT_PUBLISHED")) return { ok: false, message: "That template version isn't published." };
    if (m.includes("TEMPLATE_RETIRED")) return { ok: false, message: "That template is retired." };
    return { ok: false, message: "Couldn't create the tenant." };
  }
  const res = data as { tenant_id: string; slug: string };
  revalidatePath("/admin/tenants");
  return { ok: true, message: `Tenant "${res.slug}" created.`, slug: res.slug, tenantId: res.tenant_id };
}
