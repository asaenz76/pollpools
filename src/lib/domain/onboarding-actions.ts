"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { RpcArgs } from "@/types/rpc";

type Ok<T = object> = { ok: true } & T;
type Err = { ok: false; error: string };

export type StarterTemplate = {
  versionId: string;
  templateKey: string;
  name: string;
  description: string | null;
  category: string | null;
  iconKey: string | null;
};

/** Published templates available for self-service community creation (RX.4). */
export async function getStarterTemplates(): Promise<StarterTemplate[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("list_starter_templates");
  const rows = (data ?? []) as { version_id: string; template_key: string; name: string; description: string | null; category: string | null; icon_key: string | null }[];
  return rows.map((r) => ({ versionId: r.version_id, templateKey: r.template_key, name: r.name, description: r.description, category: r.category, iconKey: r.icon_key }));
}

const createSchema = z.object({
  versionId: z.string().uuid(),
  displayName: z.string().trim().min(2).max(80),
  slug: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/, "Use 2–62 lowercase letters, numbers, or hyphens."),
  description: z.string().trim().min(2).max(500),
  locale: z.string().trim().min(2).max(10).default("en"),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
  creatorSupport: z.boolean().default(false),
});

/**
 * Self-service community creation ("Create Your PollPool"). Reuses the atomic
 * create_pollpool RPC (guardrailed, owner-scoped) — never a second provisioning
 * path. Media is never required. Returns the new tenant slug so the client can
 * route into the fresh Tenant Dashboard.
 */
export async function createPollPoolAction(input: z.infer<typeof createSchema>): Promise<Ok<{ slug: string }> | Err> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.rpc("create_pollpool", {
    p_template_version_id: d.versionId,
    p_identity: { slug: d.slug, display_name: d.displayName, locale: d.locale, timezone: d.timezone, creator_name: d.displayName },
    p_overrides: {
      description: d.description,
      // Only creator support is a real tenant-level toggle at creation; media stays
      // optional always, and Competitor Draft is enabled per-competition later.
      featureFlags: { creator_support_enabled: d.creatorSupport },
    },
    p_include_demo: false,
  } as RpcArgs<"create_pollpool">);

  if (error) {
    if (error.message.includes("SLUG_TAKEN")) return { ok: false, error: "That community URL is already taken." };
    if (error.message.includes("INVALID_SLUG")) return { ok: false, error: "That community URL isn't valid." };
    if (error.message.includes("TENANT_LIMIT_REACHED")) return { ok: false, error: "You've reached the limit of communities you can create." };
    if (error.message.includes("NOT_AUTHORIZED")) return { ok: false, error: "Please sign in to create a community." };
    if (error.message.includes("TEMPLATE")) return { ok: false, error: "That template isn't available. Pick another." };
    return { ok: false, error: "Couldn't create your community. Please try again." };
  }
  return { ok: true, slug: (data as { slug: string }).slug };
}
