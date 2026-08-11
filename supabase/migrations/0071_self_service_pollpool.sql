-- ============================================================================
-- 0071_self_service_pollpool — Role Experience (RX.4): self-service community
-- creation ("Create Your PollPool").
--
-- ADDITIVE. Existing permissions are unchanged: create_tenant_from_template stays
-- super-admin/service-role only and keeps its exact behavior — its body is simply
-- extracted into app.provision_tenant_from_template so a second, guardrailed entry
-- point can REUSE the same atomic provisioning (never duplicated). A signed-in user
-- may create a community from a PUBLISHED template and becomes its operator
-- (membership + a pending-verification creator). Guardrails: authenticated only,
-- a per-user cap, and the template's own slug/name validation + atomic rollback.
-- Revenue Plan is auto-assigned by the existing trigger — tenants never choose it.
-- ============================================================================

-- ── Extracted provisioning core (no authorization — callers gate) ────────────
create or replace function app.provision_tenant_from_template(
  p_actor uuid,
  p_template_version_id uuid,
  p_identity jsonb,
  p_overrides jsonb,
  p_include_demo boolean,
  p_demo_owner uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := p_actor;
  v_ver tenant_template_versions%rowtype;
  v_tmpl tenant_templates%rowtype;
  v_cfg jsonb; v_seed jsonb; v_media jsonb;
  v_slug text; v_name text; v_locale text; v_tz text;
  v_tenant uuid; v_owner uuid;
  v_creator uuid; v_competition uuid; v_event uuid; v_market uuid;
  v_comp_ids uuid[] := array[]::uuid[]; v_comp_id uuid; v_name_i text; v_order int := 0;
  v_snapshot jsonb;
begin
  select * into v_ver from tenant_template_versions where id = p_template_version_id;
  if not found then raise exception 'TEMPLATE_VERSION_NOT_FOUND'; end if;
  if v_ver.published_at is null then raise exception 'TEMPLATE_NOT_PUBLISHED'; end if;
  select * into v_tmpl from tenant_templates where id = v_ver.template_id;
  if v_tmpl.status = 'retired' then raise exception 'TEMPLATE_RETIRED'; end if;

  v_cfg := coalesce(v_ver.configuration, '{}'::jsonb);
  v_seed := v_ver.seed_definition;
  v_media := coalesce(v_cfg->'settings'->'media', '{}'::jsonb);

  v_slug := lower(btrim(coalesce(p_identity->>'slug', '')));
  v_name := btrim(coalesce(p_identity->>'display_name', ''));
  if v_slug = '' or v_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$' then raise exception 'INVALID_SLUG'; end if;
  if v_name = '' then raise exception 'INVALID_NAME'; end if;
  if exists (select 1 from tenants where slug = v_slug) then raise exception 'SLUG_TAKEN'; end if;
  v_locale := coalesce(nullif(p_identity->>'locale', ''), v_cfg->>'locale', 'en');
  v_tz := coalesce(nullif(p_identity->>'timezone', ''), v_cfg->>'timezone', 'UTC');

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

  insert into tenant_feature_flags (tenant_id, flag, enabled)
  select v_tenant, key, value::boolean
  from jsonb_each_text(coalesce(v_cfg->'featureFlags', '{}'::jsonb) || coalesce(p_overrides->'featureFlags', '{}'::jsonb));

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

-- ── Super-admin entry point (unchanged behavior, now delegating) ─────────────
create or replace function public.create_tenant_from_template(
  p_template_version_id uuid,
  p_identity jsonb,
  p_overrides jsonb default '{}'::jsonb,
  p_include_demo boolean default false,
  p_demo_owner uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_super_admin() or auth.role() = 'service_role') then raise exception 'NOT_AUTHORIZED'; end if;
  return app.provision_tenant_from_template(auth.uid(), p_template_version_id, p_identity, p_overrides, p_include_demo, p_demo_owner);
end; $$;
grant execute on function public.create_tenant_from_template(uuid, jsonb, jsonb, boolean, uuid) to authenticated, service_role;

-- ── Self-service entry point ("Create Your PollPool") ────────────────────────
-- Max communities a single user may self-create (guardrail against spam/abuse).
create or replace function public.create_pollpool(
  p_template_version_id uuid,
  p_identity jsonb,
  p_overrides jsonb default '{}'::jsonb,
  p_include_demo boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_result jsonb; v_tenant uuid; v_owned int; v_cap int := 10;
begin
  if v_user is null or coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select count(distinct tenant_id) into v_owned from creators where owner_user_id = v_user;
  if v_owned >= v_cap then raise exception 'TENANT_LIMIT_REACHED' using errcode = '22000'; end if;

  -- Same atomic provisioning as the admin path; the creating user is the owner.
  v_result := app.provision_tenant_from_template(v_user, p_template_version_id, p_identity, p_overrides, p_include_demo, v_user);
  v_tenant := (v_result->>'tenant_id')::uuid;

  -- Make the creator the tenant operator: active membership + an owned creator
  -- (pending verification — self-service creators are not auto-verified).
  insert into tenant_memberships (tenant_id, user_id, role, status)
  values (v_tenant, v_user, 'creator', 'active')
  on conflict (tenant_id, user_id) do update set role = 'creator', status = 'active';

  if not exists (select 1 from creators where tenant_id = v_tenant and owner_user_id = v_user) then
    insert into creators (tenant_id, owner_user_id, display_name, slug, verification_status)
    values (v_tenant, v_user, coalesce(nullif(p_identity->>'creator_name', ''), p_identity->>'display_name'),
      'owner-' || substr(v_tenant::text, 1, 8), 'pending');
  end if;

  return v_result;
end; $$;
grant execute on function public.create_pollpool(uuid, jsonb, jsonb, boolean) to authenticated, service_role;

-- ── Published templates for onboarding (templates are super-admin-read via RLS;
-- published ones are safe to list to authenticated users for community creation).
create or replace function public.list_starter_templates()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by cat, nm), '[]'::jsonb) from (
    select jsonb_build_object(
      'version_id', v.id, 'template_key', t.key, 'name', t.name,
      'description', t.description, 'category', t.category, 'icon_key', t.icon_key
    ) as row, t.category as cat, t.name as nm
    from tenant_templates t
    join lateral (
      select id from tenant_template_versions
      where template_id = t.id and published_at is not null
      order by version desc limit 1
    ) v on true
    where t.status = 'published'
  ) s;
$$;
grant execute on function public.list_starter_templates() to authenticated, service_role;
