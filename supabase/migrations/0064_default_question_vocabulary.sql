-- ============================================================================
-- 0064_default_question_vocabulary — Phase 8-C F-21: default market question.
--
-- Removes the hard-coded English literal 'Which competitor will win?' from
-- create_event_with_market. The primary default is now derived in TS from the
-- tenant's vocabulary + default_locale (translation-ready). This SQL fallback —
-- reached only if a caller passes an empty question — derives the noun from the
-- tenant's competitor vocabulary (never the hard-coded vertical "competitor"),
-- with a neutral 'winner' as the ultimate fallback. Event-creation semantics are
-- otherwise unchanged; settlement is untouched.
-- ============================================================================

create or replace function app.default_market_question(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select 'Which ' || coalesce(
    nullif(btrim((select vocabulary->'competitor'->>'singular' from tenant_settings where tenant_id = p_tenant)), ''),
    'winner'
  ) || ' will win?';
$$;

create or replace function public.create_event_with_market(
  p_creator_id uuid,
  p_competition_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_starts_at timestamptz,
  p_locks_at timestamptz,
  p_competitor_ids uuid[],
  p_market_question text,
  p_publish boolean,
  p_media jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_creator creators%rowtype;
  v_tenant uuid;
  v_event_id uuid;
  v_market_id uuid;
  v_cid uuid;
  v_order int := 0;
  v_event_status event_status;
  v_market_status market_status;
  v_item jsonb;
begin
  select * into v_creator from creators where id = p_creator_id;
  if not found then raise exception 'CREATOR_NOT_FOUND' using errcode = 'P0002'; end if;
  if not (app.is_super_admin() or v_creator.owner_user_id = auth.uid()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  v_tenant := v_creator.tenant_id;

  if p_slug is null or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$' then
    raise exception 'INVALID_SLUG' using errcode = '22000';
  end if;
  if array_length(p_competitor_ids, 1) is null or array_length(p_competitor_ids, 1) < 2 then
    raise exception 'NEED_TWO_COMPETITORS' using errcode = '22000';
  end if;

  if p_competition_id is not null and not exists (
    select 1 from competitions c where c.id = p_competition_id and c.tenant_id = v_tenant and c.creator_id = p_creator_id
  ) then raise exception 'INVALID_COMPETITION' using errcode = '22000'; end if;

  v_event_status := case when p_publish then 'open' else 'draft' end;
  v_market_status := case when p_publish then 'open' else 'draft' end;

  insert into events (tenant_id, competition_id, creator_id, title, slug, description, starts_at, locks_at, status, result_source)
  values (v_tenant, p_competition_id, p_creator_id, p_title, p_slug, p_description, p_starts_at, p_locks_at, v_event_status, 'creator_manual')
  returning id into v_event_id;

  insert into markets (tenant_id, event_id, question, type, status, locks_at)
  values (v_tenant, v_event_id, coalesce(nullif(p_market_question, ''), app.default_market_question(v_tenant)), 'SINGLE_CHOICE_WINNER', v_market_status, p_locks_at)
  returning id into v_market_id;

  foreach v_cid in array p_competitor_ids loop
    if not exists (select 1 from competitors c where c.id = v_cid and c.tenant_id = v_tenant) then
      raise exception 'INVALID_COMPETITOR' using errcode = '22000';
    end if;
    insert into event_competitors (tenant_id, event_id, competitor_id)
      values (v_tenant, v_event_id, v_cid) on conflict do nothing;
    insert into market_options (tenant_id, market_id, competitor_id, label, color, display_order)
      select v_tenant, v_market_id, c.id, c.name, c.color, v_order from competitors c where c.id = v_cid;
    v_order := v_order + 1;
  end loop;

  -- Optional media links. A blank/absent url is skipped; media never blocks publish.
  if p_media is not null and jsonb_typeof(p_media) = 'array' then
    for v_item in select * from jsonb_array_elements(p_media) loop
      continue when coalesce(btrim(v_item->>'url'), '') = '';
      insert into event_media_links (tenant_id, event_id, provider, media_type, url, label, is_primary)
      values (
        v_tenant, v_event_id,
        lower(coalesce(nullif(btrim(v_item->>'provider'), ''), 'external')),
        coalesce(nullif(v_item->>'media_type', '')::event_media_type, 'other'),
        btrim(v_item->>'url'),
        nullif(btrim(v_item->>'label'), ''),
        coalesce((v_item->>'is_primary')::boolean, false)
      );
    end loop;
  end if;

  return jsonb_build_object('event_id', v_event_id, 'slug', p_slug);
end; $$;
