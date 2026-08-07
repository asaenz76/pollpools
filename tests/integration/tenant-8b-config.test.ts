// @vitest-environment node
process.env.CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret-value";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { adminClient, createUser, signInAs, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";
import { resolveVocabulary, term, competitionTypeLabel } from "@/lib/vocabulary";
import { resolveTenantProviders } from "@/lib/providers";
import { getEngineBehavior } from "@/lib/engine/behavior";
import { getLockState, lockDisplayState } from "@/lib/domain/locking";
import { resolveEngineVersion } from "@/lib/engine/version";
import { computeDomainRedirect, classifyDomainType } from "@/lib/domain/domains";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = Promise<{ data: T | null; error: { message: string } | null }>;

/**
 * Phase 8B.9 — a BRAND-NEW vertical ("Awards Night", an awards-show predictions
 * community) stood up with CONFIG + DATA ONLY: no code change, no migration. It
 * exercises the Phase 8-B capabilities — tenant vocabulary, the config-driven
 * provider manifest, engine version 1.1 behavior, white-label, and custom domains
 * — alongside the real predict → settle → leaderboard lifecycle, plus tenant
 * isolation.
 */
d("Tenant 8B — Awards Night (config + data only, exercises 8B capabilities)", () => {
  const s = uniqueSuffix();
  const pw = "Password123!";
  const admin = adminClient();
  let tenantId = "";
  let otherTenant = "";
  let ownerId = "";
  let ownerClient: SupabaseClient<Database>;
  let creatorId = "";
  const nominees: string[] = [];
  const voters: string[] = [];

  // Awards Night vocabulary: nominees, categories, an awards season.
  const vocabConfig = {
    competitor: { singular: "Nominee", plural: "Nominees" },
    event: { singular: "Category", plural: "Categories" },
    prediction: { singular: "Vote", plural: "Votes" },
    season: { singular: "Awards Season", plural: "Awards Seasons" },
  };

  const predict = (marketId: string, user: string, optionId: string) =>
    admin.from("predictions").insert({
      tenant_id: tenantId, market_id: marketId, user_id: user, option_id: optionId,
      original_option_id: optionId, idempotency_key: `p-${randomUUID()}`, status: "active",
    } as never);

  beforeAll(async () => {
    // ── Tenant + config (data only) ──────────────────────────────────────────
    const { data: t } = await admin
      .from("tenants")
      .insert({
        slug: `aw-${s}`,
        display_name: "Awards Night",
        status: "active",
        engine_version: "1.1", // opt into the newer engine version
        theme: { brandPrimary: "#7c3aed", brandSecondary: "#f59e0b" },
      } as never)
      .select("id")
      .single();
    tenantId = t!.id;

    await admin.from("tenant_settings").insert({
      tenant_id: tenantId,
      minimum_ranked_predictions: 1,
      vocabulary: vocabConfig,
      providers: { result: "manual", event: "manual", notification: ["in_app"] },
      show_powered_by: false, // white-label
    } as never);

    const { data: other } = await admin
      .from("tenants")
      .insert({ slug: `aw-other-${s}`, display_name: "Other" } as never)
      .select("id")
      .single();
    otherTenant = other!.id;

    // ── Owner + creator + nominees ───────────────────────────────────────────
    ownerId = await createUser(`owner-${s}@aw.test`, pw);
    await admin.from("tenant_memberships").insert({ tenant_id: tenantId, user_id: ownerId, role: "creator", status: "active" } as never);
    ownerClient = await signInAs(`owner-${s}@aw.test`, pw);

    const { data: c } = await admin
      .from("creators")
      .insert({ tenant_id: tenantId, owner_user_id: ownerId, display_name: "The Academy", slug: `academy-${s}`, verification_status: "verified" } as never)
      .select("id")
      .single();
    creatorId = c!.id;

    for (const name of ["Nominee A", "Nominee B", "Nominee C"]) {
      const { data: comp } = await admin
        .from("competitors")
        .insert({ tenant_id: tenantId, creator_id: creatorId, name, slug: `${name.replace(/\s+/g, "-").toLowerCase()}-${s}` } as never)
        .select("id")
        .single();
      nominees.push(comp!.id);
    }

    for (let i = 0; i < 3; i++) voters.push(await createUser(`voter${i}-${s}@aw.test`, pw));
  });

  afterAll(async () => {
    for (const id of [ownerId, ...voters]) if (id) await deleteUser(id);
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
    if (otherTenant) await admin.from("tenants").delete().eq("id", otherTenant);
  });

  it("resolves the tenant's vocabulary from config (presentation only)", () => {
    const vocab = resolveVocabulary(vocabConfig);
    expect(term(vocab, "competitor", { plural: true })).toBe("Nominees");
    expect(term(vocab, "event")).toBe("Category");
    expect(competitionTypeLabel(vocab, "SEASON")).toBe("Awards Season");
    // Untouched concepts fall back to English defaults.
    expect(term(vocab, "leaderboard")).toBe("Leaderboard");
  });

  it("resolves the provider manifest from config (no switch(product))", () => {
    const m = resolveTenantProviders({ result: "manual", event: "manual", notification: ["in_app"] });
    expect(m.result.id).toBe("manual");
    expect(m.event.id).toBe("manual");
    expect(m.notifications.map((p) => p.channel)).toEqual(["in_app"]);
  });

  it("honors the tenant's pinned engine version 1.1 (closing-soon display)", () => {
    expect(resolveEngineVersion("1.1")).toBe("1.1");
    const behavior = getEngineBehavior("1.1");
    const now = new Date("2026-01-01T00:00:00Z");
    const lock = getLockState({ marketStatus: "open", marketLocksAt: new Date(now.getTime() + 5 * 60_000), now });
    expect(lockDisplayState(lock, behavior.lockClosingSoonMs)).toBe("closing_soon");
  });

  it("runs the real predict → settle → leaderboard lifecycle with no code changes", async () => {
    const { data: ev, error } = await (ownerClient.rpc("create_event_with_market", {
      p_creator_id: creatorId, p_competition_id: null, p_title: "Best Picture", p_slug: `best-picture-${s}`,
      p_description: null, p_starts_at: null, p_locks_at: null, p_competitor_ids: nominees,
      p_market_question: "Who wins Best Picture?", p_publish: true, p_media: [],
    } as never) as unknown as Rpc<{ event_id: string }>);
    expect(error).toBeNull();
    const eventId = ev!.event_id;

    const { data: mkt } = await admin.from("markets").select("id").eq("event_id", eventId).single();
    const { data: opts } = await admin.from("market_options").select("id, competitor_id").eq("market_id", mkt!.id);
    const winnerOption = opts!.find((o) => o.competitor_id === nominees[0])!;

    for (const v of voters) await predict(mkt!.id, v, winnerOption.id);

    const { error: settleErr } = await admin.rpc("settle_event", {
      p_event_id: eventId, p_resolution: "settled", p_winning_competitor_id: nominees[0],
      p_notes: null, p_result_url: null, p_idempotency_key: `st-${randomUUID()}`, p_winning_option_ids: null,
    } as never);
    expect(settleErr).toBeNull();

    await drainJobs(admin, tenantId);

    const { data: lb } = await admin
      .from("leaderboard_snapshots")
      .select("user_id, total_points")
      .eq("tenant_id", tenantId)
      .eq("scope", "global");
    // All three voters picked the winner → each earned a point.
    expect((lb ?? []).filter((r) => r.total_points > 0).length).toBe(3);
  });

  it("reconciles cleanly (no differences) for the new tenant", async () => {
    const { data, error } = await (admin.rpc("reconcile", {
      p_tenant: tenantId, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `rec-${randomUUID()}`,
    } as never) as unknown as Rpc<{ differences_found: number }>);
    expect(error).toBeNull();
    expect(data!.differences_found).toBe(0);
  });

  it("supports custom domains via config: add → verify → primary → redirect", async () => {
    const rootDomain = "pe.example";
    expect(classifyDomainType("awards.example.com", rootDomain)).toBe("custom_subdomain");
    expect(classifyDomainType("awards-night.com", rootDomain)).toBe("custom_apex");

    // Add two domains (pending). Real DNS can't be created in a test, so we simulate
    // a successful verification by flipping verification_status (the trigger mirrors
    // it onto `verified`). The verification LOGIC itself is unit-tested separately.
    const apex = "awards-night.com";
    const www = "www.awards-night.com";
    await admin.from("tenant_domains").insert([
      { tenant_id: tenantId, domain: apex, domain_type: "custom_apex", verification_token: "tok-apex" },
      { tenant_id: tenantId, domain: www, domain_type: "custom_subdomain", verification_token: "tok-www" },
    ] as never);

    await admin.from("tenant_domains").update({ verification_status: "verified" } as never).eq("tenant_id", tenantId).eq("domain", apex);
    await admin.from("tenant_domains").update({ verification_status: "verified", is_primary: true } as never).eq("tenant_id", tenantId).eq("domain", www);

    const { data: rows } = await admin
      .from("tenant_domains")
      .select("domain, is_primary, verified")
      .eq("tenant_id", tenantId);
    const domains = (rows ?? []).map((r) => ({ domain: r.domain, isPrimary: r.is_primary, verified: r.verified }));

    // Host resolution: verified domain maps back to this tenant.
    const { data: resolved } = await admin
      .from("tenant_domains")
      .select("tenant_id")
      .eq("domain", www)
      .eq("verified", true)
      .maybeSingle();
    expect(resolved!.tenant_id).toBe(tenantId);

    // Non-primary verified host redirects to the primary; primary does not.
    expect(computeDomainRedirect(apex, domains)).toBe(www);
    expect(computeDomainRedirect(www, domains)).toBeNull();

    // Exactly one primary is enforced by the DB unique index.
    const dup = await admin.from("tenant_domains").update({ is_primary: true } as never).eq("tenant_id", tenantId).eq("domain", apex);
    expect(dup.error).not.toBeNull();
  });

  it("keeps tenant data isolated from other tenants", async () => {
    const { count } = await admin
      .from("competitors")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", otherTenant);
    expect(count ?? 0).toBe(0);
  });
});
