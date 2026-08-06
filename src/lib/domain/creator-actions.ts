"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBracket } from "@/lib/domain/competitions";
import { isValidTenantSlug } from "@/lib/tenant/resolver";
import { validateMediaUrl, detectProvider } from "@/lib/domain/media";
import { EVENT_MEDIA_TYPE } from "@/types/enums";
import { getMarketGrader, UnsupportedMarketTypeError } from "@/lib/engine/graders";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { RpcArgs } from "@/types/rpc";
import type { MarketType } from "@/types/enums";

type Ok<T = object> = { ok: true } & T;
type Err = { ok: false; error: string };

const uuid = z.string().uuid();

/** URL-safe slug from a title, plus a short suffix to avoid collisions. */
function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "item"}-${suffix}`;
}

async function requireUser(supabase: SupabaseClient<Database>): Promise<{ id: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id } : null;
}

/** Resolve an active tenant by slug (safe: never trusts a client tenant id). */
async function resolveTenant(supabase: SupabaseClient<Database>, slug: string): Promise<string | null> {
  if (!isValidTenantSlug(slug)) return null;
  const { data } = await supabase.from("tenants").select("id").eq("slug", slug).eq("status", "active").maybeSingle();
  return data?.id ?? null;
}

// ── Onboarding ───────────────────────────────────────────────────────────────
const becomeCreatorSchema = z.object({
  tenantSlug: z.string(),
  displayName: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
});

export async function becomeCreatorAction(input: z.infer<typeof becomeCreatorSchema>): Promise<Ok<{ slug: string }> | Err> {
  const parsed = becomeCreatorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const supabase = await createServerSupabase();
  const user = await requireUser(supabase);
  if (!user) return { ok: false, error: "Please sign in." };
  const tenantId = await resolveTenant(supabase, parsed.data.tenantSlug);
  if (!tenantId) return { ok: false, error: "Community not found." };

  // Must be a member first.
  await supabase.from("tenant_memberships").upsert(
    { tenant_id: tenantId, user_id: user.id, role: "creator", status: "active" },
    { onConflict: "tenant_id,user_id", ignoreDuplicates: true },
  );

  const existing = await supabase.from("creators").select("slug").eq("tenant_id", tenantId).eq("owner_user_id", user.id).maybeSingle();
  if (existing.data) return { ok: true, slug: existing.data.slug };

  const slug = slugify(parsed.data.displayName);
  const { data, error } = await supabase
    .from("creators")
    .insert({ tenant_id: tenantId, owner_user_id: user.id, display_name: parsed.data.displayName, slug, description: parsed.data.description ?? null, verification_status: "pending" })
    .select("slug")
    .single();
  if (error) return { ok: false, error: "Couldn't create your creator profile." };
  return { ok: true, slug: data.slug };
}

export async function updateCreatorProfileAction(input: { creatorId: string; displayName: string; description?: string }): Promise<Ok | Err> {
  const parsed = z.object({ creatorId: uuid, displayName: z.string().trim().min(2).max(80), description: z.string().trim().max(500).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("creators")
    .update({ display_name: parsed.data.displayName, description: parsed.data.description ?? null })
    .eq("id", parsed.data.creatorId);
  if (error) return { ok: false, error: "Couldn't save." };
  return { ok: true };
}

// ── Competitors ──────────────────────────────────────────────────────────────
export async function addCompetitorAction(input: { creatorId: string; name: string; color?: string }): Promise<Ok | Err> {
  const parsed = z.object({ creatorId: uuid, name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a competitor name." };
  const supabase = await createServerSupabase();
  const { data: creator } = await supabase.from("creators").select("tenant_id").eq("id", parsed.data.creatorId).maybeSingle();
  if (!creator) return { ok: false, error: "Creator not found." };
  const { error } = await supabase.from("competitors").insert({
    tenant_id: creator.tenant_id, creator_id: parsed.data.creatorId, name: parsed.data.name, slug: slugify(parsed.data.name), color: parsed.data.color ?? null,
  });
  if (error) return { ok: false, error: "Couldn't add competitor." };
  return { ok: true };
}

// ── Competitions ─────────────────────────────────────────────────────────────
const competitionSchema = z.object({
  creatorId: uuid,
  type: z.enum(["STANDALONE_EVENT", "SEASON", "TOURNAMENT", "BRACKET"]),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
});

export async function createCompetitionAction(input: z.infer<typeof competitionSchema>): Promise<Ok<{ competitionId: string; slug: string }> | Err> {
  const parsed = competitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const supabase = await createServerSupabase();
  const { data: creator } = await supabase.from("creators").select("tenant_id").eq("id", parsed.data.creatorId).maybeSingle();
  if (!creator) return { ok: false, error: "Creator not found." };
  const slug = slugify(parsed.data.title);
  const { data, error } = await supabase
    .from("competitions")
    .insert({ tenant_id: creator.tenant_id, creator_id: parsed.data.creatorId, type: parsed.data.type, title: parsed.data.title, slug, description: parsed.data.description ?? null, status: "active" })
    .select("id, slug")
    .single();
  if (error) return { ok: false, error: "Couldn't create competition." };
  return { ok: true, competitionId: data.id, slug: data.slug };
}

/** Create a BRACKET competition and generate its bracket from 2–32 competitors. */
export async function createBracketCompetitionAction(input: { creatorId: string; title: string; description?: string; competitorIds: string[] }): Promise<Ok<{ slug: string }> | Err> {
  const comp = await createCompetitionAction({ creatorId: input.creatorId, type: "BRACKET", title: input.title, description: input.description });
  if (!comp.ok) return comp;
  const bracket = await createBracket({ competitionId: comp.competitionId, competitorIds: input.competitorIds });
  if (!bracket.ok) return { ok: false, error: bracket.error };
  return { ok: true, slug: comp.slug };
}

// ── Events ───────────────────────────────────────────────────────────────────
// Optional event media (Phase 7.6). A live/recorded/external link is optional but
// recommended — publication is NEVER blocked by its absence.
const mediaItemSchema = z.object({
  url: z.string().trim().min(1),
  provider: z.string().trim().max(40).optional(),
  mediaType: z.enum(EVENT_MEDIA_TYPE).optional(),
  label: z.string().trim().max(120).optional(),
  isPrimary: z.boolean().optional(),
});

const eventSchema = z.object({
  creatorId: uuid,
  competitionId: uuid.nullable().optional(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  startsAt: z.string().optional(),
  locksAt: z.string().optional(),
  media: z.array(mediaItemSchema).max(10).optional(),
  competitorIds: z.array(uuid).min(2, "Select at least 2 competitors"),
  marketQuestion: z.string().trim().max(200).optional(),
  publish: z.boolean().default(true),
});

export async function createEventAction(input: z.infer<typeof eventSchema>): Promise<Ok<{ slug: string }> | Err> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Validate + normalize any media links. A single link defaults to primary.
  const items = parsed.data.media ?? [];
  const media: { url: string; provider: string; media_type: string; label: string | null; is_primary: boolean }[] = [];
  for (const item of items) {
    const v = validateMediaUrl(item.url);
    if (!v.ok) return { ok: false, error: v.error };
    media.push({
      url: v.url.toString(),
      provider: item.provider?.trim() || detectProvider(v.url),
      media_type: item.mediaType ?? "other",
      label: item.label ?? null,
      is_primary: item.isPrimary ?? false,
    });
  }
  if (media.length === 1) media[0]!.is_primary = true;
  if (media.filter((m) => m.is_primary).length > 1) return { ok: false, error: "Only one media link can be primary." };

  const supabase = await createServerSupabase();
  const slug = slugify(parsed.data.title);
  const { data, error } = await supabase.rpc("create_event_with_market", {
    p_creator_id: parsed.data.creatorId,
    p_competition_id: parsed.data.competitionId ?? null,
    p_title: parsed.data.title,
    p_slug: slug,
    p_description: parsed.data.description ?? null,
    p_starts_at: parsed.data.startsAt || null,
    p_locks_at: parsed.data.locksAt || null,
    p_competitor_ids: parsed.data.competitorIds,
    p_market_question: parsed.data.marketQuestion || null,
    p_publish: parsed.data.publish,
    p_media: media,
  } as RpcArgs<"create_event_with_market">);
  if (error) return { ok: false, error: "Couldn't create the event. Check your inputs." };
  return { ok: true, slug: (data as { slug: string }).slug };
}

// ── Result submission (settlement) ───────────────────────────────────────────
export async function submitResultAction(input: { eventId: string; winningCompetitorId: string; notes?: string; resultUrl?: string }): Promise<Ok | Err> {
  const parsed = z.object({ eventId: uuid, winningCompetitorId: uuid, notes: z.string().max(1000).optional(), resultUrl: z.string().url().optional().or(z.literal("")) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const supabase = await createServerSupabase();
  const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  // Resolve the winning option(s) per market via its grader (strategy per market
  // type). Settlement grades against these; if none resolve, it falls back to the
  // single-winner competitor mapping.
  const { data: markets } = await supabase
    .from("markets")
    .select("id, type, market_options(id, competitor_id)")
    .eq("event_id", parsed.data.eventId);
  const winningOptionIds: string[] = [];
  try {
    for (const m of markets ?? []) {
      const grader = getMarketGrader(m.type as MarketType);
      const opts = (m.market_options ?? []).map((o) => ({ id: o.id, competitorId: o.competitor_id }));
      winningOptionIds.push(...grader.resolveWinningOptionIds(opts, { winningCompetitorId: parsed.data.winningCompetitorId }));
    }
  } catch (e) {
    if (e instanceof UnsupportedMarketTypeError) return { ok: false, error: "This market type can't be settled yet." };
    throw e;
  }

  const { error } = await supabase.rpc("settle_event", {
    p_event_id: parsed.data.eventId,
    p_resolution: "settled",
    p_winning_competitor_id: parsed.data.winningCompetitorId,
    p_notes: parsed.data.notes || null,
    p_result_url: parsed.data.resultUrl || null,
    p_idempotency_key: `result-${parsed.data.eventId}-${key}`,
    p_winning_option_ids: winningOptionIds.length > 0 ? winningOptionIds : null,
  } as RpcArgs<"settle_event">);
  if (error) {
    if (error.message.includes("NOT_AUTHORIZED")) return { ok: false, error: "Results for your events are reviewed by an admin. Ask a Super Admin to enable direct settlement." };
    if (error.message.includes("ALREADY_SETTLED")) return { ok: false, error: "This event is already settled." };
    return { ok: false, error: "Couldn't submit the result." };
  }
  return { ok: true };
}
