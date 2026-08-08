-- ============================================================================
-- 0066_create_tenant_from_template — Phase 8-D: atomic template application.
--
-- One deterministic, transactional entry point. If any step fails the whole
-- function rolls back — never a partially-created tenant, never an orphan
-- assignment. Maps the template's configuration onto the EXISTING tenant systems
-- (tenants / tenant_settings / feature flags), optionally seeds demo data, and
-- records an immutable snapshot of exactly what was applied. No engine branching
-- by template. Super-admin / service-role only.
-- ============================================================================

create or replace function public.create_tenant_from_template(
  p_template_version_id uuid,
  p_identity jsonb,
  p_overrides jsonb default '{}'::jsonb,
  p_include_demo boolean default false,
  p_demo_owner uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_ver tenant_template_versions%rowtype;
  v_tmpl tenant_templates%rowtype;
  v_cfg jsonb; v_seed jsonb; v_media jsonb;
  v_slug text; v_name text; v_locale text; v_tz text;
  v_tenant uuid; v_owner uuid;
  v_creator uuid; v_competition uuid; v_event uuid; v_market uuid;
  v_comp_ids uuid[] := array[]::uuid[]; v_comp_id uuid; v_name_i text; v_order int := 0;
  v_snapshot jsonb;
begin
  if not (app.is_super_admin() or auth.role() = 'service_role') then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_ver from tenant_template_versions where id = p_template_version_id;
  if not found then raise exception 'TEMPLATE_VERSION_NOT_FOUND'; end if;
  if v_ver.published_at is null then raise exception 'TEMPLATE_NOT_PUBLISHED'; end if;
  select * into v_tmpl from tenant_templates where id = v_ver.template_id;
  if v_tmpl.status = 'retired' then raise exception 'TEMPLATE_RETIRED'; end if;

  v_cfg := coalesce(v_ver.configuration, '{}'::jsonb);
  v_seed := v_ver.seed_definition;
  v_media := coalesce(v_cfg->'settings'->'media', '{}'::jsonb);

  -- ── Identity + slug (required) ─────────────────────────────────────────────
  v_slug := lower(btrim(coalesce(p_identity->>'slug', '')));
  v_name := btrim(coalesce(p_identity->>'display_name', ''));
  if v_slug = '' or v_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$' then raise exception 'INVALID_SLUG'; end if;
  if v_name = '' then raise exception 'INVALID_NAME'; end if;
  if exists (select 1 from tenants where slug = v_slug) then raise exception 'SLUG_TAKEN'; end if;
  v_locale := coalesce(nullif(p_identity->>'locale', ''), v_cfg->>'locale', 'en');
  v_tz := coalesce(nullif(p_identity->>'timezone', ''), v_cfg->>'timezone', 'UTC');

  -- ── Tenant (auto-assigns the default Revenue Plan via existing trigger) ─────
  insert into tenants (slug, display_name, tagline, description, status, default_locale, default_timezone,
    logo_url, icon_url, theme, engine_version, template_id, template_version)
  values (
    v_slug, v_name,
    coalesce(p_overrides->>'tagline', v_cfg->>'tagline'),
    coalesce(p_overrides->>'description', v_cfg->>'description'),
    'active', v_locale, v_tz,
    coalesce(p_overrides->>'logoUrl', v_cfg->>'logoUrl'),
    coalesce(p_overrides->>'iconUrl', v_cfg->>'iconUrl'),
    coalesce(p_overrides->'theme', v_cfg->'theme', '{}'::jsonb),
    v_ver.engine_version, v_tmpl.id, v_ver.version
  ) returning id into v_tenant;

  -- ── tenant_settings ────────────────────────────────────────────────────────
  insert into tenant_settings (tenant_id, sentiment_visibility, small_participation_display, minimum_ranked_predictions,
    show_powered_by, vocabulary, providers, enabled_competition_types,
    event_media_enabled, event_media_optional, external_media_links_enabled, inline_embeds_enabled,
    allowed_media_providers, preferred_media_provider, settings)
  values (
    v_tenant,
    coalesce((v_cfg->'settings'->>'sentimentVisibility')::sentiment_visibility, 'always'),
    coalesce((v_cfg->'settings'->>'smallParticipationDisplay')::boolean, true),
    coalesce((v_cfg->'settings'->>'minimumRankedPredictions')::int, 5),
    coalesce((v_cfg->'settings'->>'showPoweredBy')::boolean, true),
    coalesce(v_cfg->'vocabulary', '{}'::jsonb),
    coalesce(p_overrides->'providers', v_cfg->'providers', '{}'::jsonb),
    coalesce(
      (select array_agg(x::competition_type) from jsonb_array_elements_text(v_cfg->'enabledCompetitionTypes') x),
      array['STANDALONE_EVENT', 'SEASON', 'TOURNAMENT', 'BRACKET']::competition_type[]
    ),
    coalesce((v_media->>'enabled')::boolean, true),
    coalesce((v_media->>'optional')::boolean, true),
    coalesce((v_media->>'externalLinksEnabled')::boolean, true),
    coalesce((v_media->>'inlineEmbedsEnabled')::boolean, true),
    coalesce((select array_agg(x) from jsonb_array_elements_text(v_media->'allowedProviders') x), array[]::text[]),
    coalesce(v_media->>'preferredProvider', v_cfg->'providers'->>'media'),
    jsonb_build_object('templateDefaults', jsonb_build_object(
      'marketTemplates', coalesce(v_cfg->'marketTemplates', '[]'::jsonb),
      'competitionDefaults', coalesce(v_cfg->'competitionDefaults', '{}'::jsonb),
      'revenue', coalesce(v_cfg->'revenue', '{}'::jsonb)))
  );

  -- ── Feature flags (config, overridden by permitted creation-time toggles) ──
  insert into tenant_feature_flags (tenant_id, flag, enabled)
  select v_tenant, key, value::boolean
  from jsonb_each_text(coalesce(v_cfg->'featureFlags', '{}'::jsonb) || coalesce(p_overrides->'featureFlags', '{}'::jsonb));

  -- ── Optional demo seed (owned by the actor) ────────────────────────────────
  if p_include_demo and v_seed is not null then
    v_owner := coalesce(p_demo_owner, v_actor);
    if v_owner is null then raise exception 'DEMO_OWNER_REQUIRED'; end if;

    insert into creators (tenant_id, owner_user_id, display_name, slug, verification_status)
    values (v_tenant, v_owner, coalesce(v_seed->'creator'->>'displayName', 'Demo'), 'demo-' || substr(v_tenant::text, 1, 8), 'verified')
    returning id into v_creator;

    for v_name_i in select value from jsonb_array_elements_text(coalesce(v_seed->'competitors', '[]'::jsonb)) loop
      insert into competitors (tenant_id, creator_id, name, slug)
      values (v_tenant, v_creator, v_name_i, 'demo-' || v_order || '-' || substr(gen_random_uuid()::text, 1, 8))
      returning id into v_comp_id;
      v_comp_ids := v_comp_ids || v_comp_id;
      v_order := v_order + 1;
    end loop;

    if v_seed->'competition' is not null then
      insert into competitions (tenant_id, creator_id, type, title, slug)
      values (v_tenant, v_creator, (v_seed->'competition'->>'type')::competition_type, v_seed->'competition'->>'title', 'demo-comp-' || substr(v_tenant::text, 1, 8))
      returning id into v_competition;
      if coalesce((v_cfg->'competitionDefaults'->>'draftEnabled')::boolean, false) then
        insert into competition_draft_settings (tenant_id, competition_id, created_by, is_enabled)
        values (v_tenant, v_competition, v_owner, true);
      end if;
    end if;

    if v_seed->'event' is not null and array_length(v_comp_ids, 1) >= 2 then
      insert into events (tenant_id, competition_id, creator_id, title, slug, status, result_source)
      values (v_tenant, v_competition, v_creator, v_seed->'event'->>'title', 'demo-event-' || substr(v_tenant::text, 1, 8), 'open', 'creator_manual')
      returning id into v_event;

      insert into markets (tenant_id, event_id, question, type, status)
      values (v_tenant, v_event, coalesce(nullif(v_seed->'event'->>'question', ''), app.default_market_question(v_tenant)), 'SINGLE_CHOICE_WINNER', 'open')
      returning id into v_market;

      v_order := 0;
      foreach v_comp_id in array v_comp_ids loop
        insert into event_competitors (tenant_id, event_id, competitor_id) values (v_tenant, v_event, v_comp_id) on conflict do nothing;
        insert into market_options (tenant_id, market_id, competitor_id, label, color, display_order)
          select v_tenant, v_market, c.id, c.name, c.color, v_order from competitors c where c.id = v_comp_id;
        v_order := v_order + 1;
      end loop;
    end if;
  end if;

  -- ── Immutable snapshot of exactly what was applied + audit ──────────────────
  v_snapshot := jsonb_build_object(
    'template_key', v_tmpl.key, 'template_version', v_ver.version, 'engine_version', v_ver.engine_version,
    'identity', p_identity, 'overrides', p_overrides, 'configuration', v_cfg,
    'seed_applied', p_include_demo and v_seed is not null);

  insert into tenant_template_assignments (tenant_id, template_id, template_version, applied_by, snapshot)
  values (v_tenant, v_tmpl.id, v_ver.version, v_actor, v_snapshot);

  perform app.write_audit('tenant.created_from_template', 'tenant', v_tenant, v_tenant, v_actor,
    'Created ' || v_slug || ' from ' || v_tmpl.key || ' v' || v_ver.version,
    jsonb_build_object('template', v_tmpl.key, 'version', v_ver.version, 'demo', p_include_demo));

  return jsonb_build_object('tenant_id', v_tenant, 'slug', v_slug, 'template', v_tmpl.key, 'version', v_ver.version);
end; $$;

grant execute on function public.create_tenant_from_template(uuid, jsonb, jsonb, boolean, uuid) to authenticated, service_role;
