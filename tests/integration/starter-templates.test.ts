// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { adminClient, createUser, deleteUser, uniqueSuffix, integrationEnvReady } from "./helpers";
import { drainJobs } from "@/lib/jobs";
import { resolveVocabulary } from "@/lib/vocabulary";
import { resolveTenantProviders } from "@/lib/providers";

const d = integrationEnvReady ? describe : describe.skip;
type Rpc<T> = { data: T | null; error: { message: string } | null };

/**
 * Phase 8-D 8D.3 — every starter template creates a fully-working tenant from
 * config + demo data alone: config/vocabulary/providers/flags resolve, and the
 * full predict → settle → leaderboard → reconcile lifecycle works, isolated.
 */
d("Starter templates — end-to-end (8D.3)", () => {
  const s = uniqueSuffix();
  const admin = adminClient();
  let owner = "";
  const voters: string[] = [];
  const createdTenantIds: string[] = [];

  const TEMPLATES: { key: string; competitor: string; draft: boolean }[] = [
    { key: "general", competitor: "Competitor", draft: false },
    { key: "club_sports", competitor: "Club", draft: false },
    { key: "racing", competitor: "Racer", draft: true },
    { key: "awards", competitor: "Participant", draft: false },
    { key: "cook_off", competitor: "Chef", draft: false },
  ];

  beforeAll(async () => {
    owner = await createUser(`st-owner-${s}@st.test`, "Password123!");
    for (let i = 0; i < 3; i++) voters.push(await createUser(`st-v${i}-${s}@st.test`, "Password123!"));
  });

  afterAll(async () => {
    for (const id of createdTenantIds) await admin.from("tenants").delete().eq("id", id);
    for (const u of [owner, ...voters]) if (u) await deleteUser(u);
  });

  for (const tmpl of TEMPLATES) {
    it(`creates a working tenant from the "${tmpl.key}" template`, async () => {
      const { data: t } = await admin.from("tenant_templates").select("id").eq("key", tmpl.key).single();
      const { data: v } = await admin.from("tenant_template_versions").select("id").eq("template_id", t!.id).eq("version", 1).single();

      const slug = `st-${tmpl.key}-${s}`.replace(/_/g, "-");
      const { data: res, error } = (await admin.rpc("create_tenant_from_template" as never, {
        p_template_version_id: v!.id, p_identity: { slug, display_name: tmpl.key }, p_overrides: {}, p_include_demo: true, p_demo_owner: owner,
      } as never)) as unknown as Rpc<{ tenant_id: string }>;
      expect(error).toBeNull();
      const tid = res!.tenant_id;
      createdTenantIds.push(tid);

      // ── Config resolves ──────────────────────────────────────────────────────
      const { data: tenant } = await admin.from("tenants").select("engine_version, template_id, template_version").eq("id", tid).single();
      expect(tenant!.engine_version).toBe("1.0");
      expect(tenant!.template_id).toBe(t!.id);
      expect(tenant!.template_version).toBe(1);

      const { data: settings } = await admin.from("tenant_settings").select("vocabulary, providers, settings").eq("tenant_id", tid).single();
      const vocab = resolveVocabulary(settings!.vocabulary);
      expect(vocab.competitor.singular).toBe(tmpl.competitor);
      const manifest = resolveTenantProviders(settings!.providers);
      expect(manifest.result.id).toBe("manual");
      expect(manifest.event.id).toBe("manual");
      // Market templates are recorded in the tenant settings.
      const defaults = (settings!.settings as { templateDefaults?: { marketTemplates?: unknown[] } })?.templateDefaults;
      expect(Array.isArray(defaults?.marketTemplates)).toBe(true);

      const { data: flags } = await admin.from("tenant_feature_flags").select("flag, enabled").eq("tenant_id", tid);
      expect(flags!.find((f) => f.flag === "predictions_enabled")!.enabled).toBe(true);

      // Draft applicability matches the template.
      const { count: draftCount } = await admin.from("competition_draft_settings").select("id", { count: "exact", head: true }).eq("tenant_id", tid).eq("is_enabled", true);
      expect((draftCount ?? 0) > 0).toBe(tmpl.draft);

      // ── Full lifecycle on the demo event ─────────────────────────────────────
      const { data: ev } = await admin.from("events").select("id").eq("tenant_id", tid).single();
      const { data: mkt } = await admin.from("markets").select("id").eq("event_id", ev!.id).single();
      const { data: opts } = await admin.from("market_options").select("id, competitor_id").eq("market_id", mkt!.id).order("display_order");
      const winner = opts![0]!;
      for (const u of voters) {
        await admin.from("predictions").insert({ tenant_id: tid, market_id: mkt!.id, user_id: u, option_id: winner.id, original_option_id: winner.id, idempotency_key: `p-${randomUUID()}`, status: "active" } as never);
      }
      const { error: settleErr } = await admin.rpc("settle_event" as never, {
        p_event_id: ev!.id, p_resolution: "settled", p_winning_competitor_id: winner.competitor_id, p_notes: null, p_result_url: null, p_idempotency_key: `st-${randomUUID()}`, p_winning_option_ids: null,
      } as never);
      expect(settleErr).toBeNull();
      await drainJobs(admin, tid);

      const { data: lb } = await admin.from("leaderboard_snapshots").select("total_points").eq("tenant_id", tid).eq("scope", "global");
      expect((lb ?? []).filter((r) => r.total_points > 0).length).toBe(3); // all three predicted the winner

      // ── Reconcile clean + isolation ──────────────────────────────────────────
      const { data: rec } = (await admin.rpc("reconcile" as never, { p_tenant: tid, p_scope_type: "tenant", p_scope_id: null, p_mode: "dry_run", p_idempotency_key: `rec-${randomUUID()}` } as never)) as unknown as Rpc<{ differences_found: number }>;
      expect(rec!.differences_found).toBe(0);
    });
  }

  it("keeps template-created tenants isolated from each other", async () => {
    // A competitor in one tenant never appears in another.
    const [a, b] = createdTenantIds;
    if (!a || !b) return;
    const { data: aComps } = await admin.from("competitors").select("id").eq("tenant_id", a);
    const aIds = new Set((aComps ?? []).map((c) => c.id));
    const { data: bComps } = await admin.from("competitors").select("id").eq("tenant_id", b);
    for (const c of bComps ?? []) expect(aIds.has(c.id)).toBe(false);
  });
});
