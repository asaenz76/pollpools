"use server";

import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { createBracket } from "@/lib/domain/competitions";
import { isValidTenantSlug } from "@/lib/tenant/resolver";
import { slugify } from "@/lib/domain/slug";
import { getMarketGrader, UnsupportedMarketTypeError } from "@/lib/engine/graders";
import { resolveResultProvider } from "@/lib/providers/result";
import { resolveEventProvider, type ManualEventInput } from "@/lib/providers/event";
import { getTenantContext } from "@/lib/tenant/context";
import { defaultMarketQuestion } from "@/lib/vocabulary";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { RpcArgs } from "@/types/rpc";
import type { MarketType } from "@/types/enums";

type Ok<T = object> = { ok: true } & T;
type Err = { ok: false; error: string };

const uuid = z.string().uuid();

/** URL-safe slug from a title, plus a short suffix to avoid collisions. */

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
// Event validation + normalization (incl. optional media, Phase 7.6) is owned by
// the manual EventProvider (Phase 8B.4). Media links stay OPTIONAL — publication
// is NEVER blocked by their absence. The create-event engine below is untouched.
export async function createEventAction(input: ManualEventInput): Promise<Ok<{ slug: string }> | Err> {
  const validated = resolveEventProvider("manual").validate(input);
  if (!validated.ok) return { ok: false, error: validated.error };
  const ev = validated.value;

  const supabase = await createServerSupabase();
  // F-21: when the creator gives no question, derive a localized default from the
  // tenant's vocabulary + default_locale (never a hard-coded English literal).
  let marketQuestion = ev.marketQuestion;
  if (!marketQuestion) {
    const ctx = await getTenantContext();
    if (ctx) marketQuestion = defaultMarketQuestion(ctx.vocabulary, ctx.tenant.defaultLocale);
  }

  const { data, error } = await supabase.rpc("create_event_with_market", {
    p_creator_id: ev.creatorId,
    p_competition_id: ev.competitionId,
    p_title: ev.title,
    p_slug: ev.slug,
    p_description: ev.description,
    p_starts_at: ev.startsAt,
    p_locks_at: ev.locksAt,
    p_competitor_ids: ev.competitorIds,
    p_market_question: marketQuestion,
    p_publish: ev.publish,
    p_media: ev.media.map((m) => ({
      url: m.url,
      provider: m.provider,
      media_type: m.mediaType,
      label: m.label,
      is_primary: m.isPrimary,
    })),
  } as RpcArgs<"create_event_with_market">);
  if (error) return { ok: false, error: "Couldn't create the event. Check your inputs." };
  return { ok: true, slug: (data as { slug: string }).slug };
}

// ── Result submission (settlement) ───────────────────────────────────────────
// The authoritative result is the selected winning market option(s). A winning
// competitor is optional — supplied only when the selected option represents one —
// so non-competitor outcomes (Draw / Yes / No …) settle without a competitor. A
// competitor-only call is still accepted (backward compatible) and resolves its
// option via the market grader.
export async function submitResultAction(input: {
  eventId: string;
  winningOptionIds?: string[];
  winningCompetitorId?: string;
  notes?: string;
  resultUrl?: string;
}): Promise<Ok | Err> {
  const eventCheck = uuid.safeParse(input.eventId);
  if (!eventCheck.success) return { ok: false, error: "Invalid input." };
  // Manual result provider owns the raw-submission validation + normalization; the
  // engine authority (settle_event RPC) below is untouched.
  const validated = resolveResultProvider("manual").validate(input);
  if (!validated.ok) return { ok: false, error: validated.error };
  const result = validated.value;
  const eventId = eventCheck.data;
  const supabase = await createServerSupabase();
  const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  const optionIds: string[] = [...result.winningOptionIds];
  const { data: markets } = await supabase
    .from("markets")
    .select("id, type, market_options(id, competitor_id)")
    .eq("event_id", eventId);
  try {
    for (const m of markets ?? []) {
      // Ensure the market type is supported (raises loudly for an unregistered grader).
      const grader = getMarketGrader(m.type as MarketType);
      // Back-compat: a competitor-only submission resolves its option(s) via the grader.
      if (optionIds.length === 0 && result.winningCompetitorId) {
        const opts = (m.market_options ?? []).map((o) => ({ id: o.id, competitorId: o.competitor_id }));
        optionIds.push(...grader.resolveWinningOptionIds(opts, { winningCompetitorId: result.winningCompetitorId }));
      }
    }
  } catch (e) {
    if (e instanceof UnsupportedMarketTypeError) return { ok: false, error: "This market type can't be settled yet." };
    throw e;
  }

  const { error } = await supabase.rpc("settle_event", {
    p_event_id: eventId,
    p_resolution: "settled",
    p_winning_competitor_id: result.winningCompetitorId,
    p_notes: result.notes,
    p_result_url: result.resultUrl,
    p_idempotency_key: `result-${eventId}-${key}`,
    p_winning_option_ids: optionIds.length > 0 ? optionIds : null,
  } as RpcArgs<"settle_event">);
  if (error) {
    if (error.message.includes("NOT_AUTHORIZED")) return { ok: false, error: "Results for your events are reviewed by an admin. Ask a Super Admin to enable direct settlement." };
    if (error.message.includes("ALREADY_SETTLED")) return { ok: false, error: "This event is already settled." };
    return { ok: false, error: "Couldn't submit the result." };
  }
  return { ok: true };
}
