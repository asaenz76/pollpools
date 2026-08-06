-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 7.6 §3–§9 — remove the mandatory YouTube dependency; introduce a generic,
-- optional event-media model.
--
-- An event is now valid with NO media at all. Media is an optional, generic
-- external link (livestream / video / event page / social post). Provider is an
-- OPEN TEXT value validated by an app-side registry — NOT a closed enum — so a new
-- media platform never requires an engine migration (enum-governance policy). Only
-- `media_type` is a small, stable engine enum.
-- ─────────────────────────────────────────────────────────────────────────────

-- media_type is stable engine classification (drives embed vs. external-link UX).
create type event_media_type as enum ('livestream', 'video', 'event_page', 'social_post', 'other');

create table event_media_links (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  event_id      uuid not null references events (id) on delete cascade,
  provider      text not null,                       -- open registry value (e.g. youtube, tiktok, external)
  media_type    event_media_type not null,
  url           text not null check (btrim(url) <> ''),
  label         text,
  thumbnail_url text,
  is_primary    boolean not null default false,
  starts_at     timestamptz,
  ends_at       timestamptz,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_event_media_event on event_media_links (event_id);
create index idx_event_media_tenant on event_media_links (tenant_id);
-- At most one primary media per event.
create unique index uq_event_media_primary on event_media_links (event_id) where is_primary;

create trigger trg_event_media_updated_at
  before update on event_media_links
  for each row execute function app.set_updated_at();

-- ── RLS: DB-level tenant + ownership isolation (not app-filter-only) ───────────
alter table event_media_links enable row level security;

-- Read: media of a PUBLISHED event is public (mirrors the event read model); the
-- event's creator owner and super-admins may also read their draft event media.
create policy event_media_read on event_media_links for select using (
  exists (
    select 1 from events e
    where e.id = event_media_links.event_id
      and (
        e.status <> 'draft'
        or app.is_super_admin()
        or exists (select 1 from creators c where c.id = e.creator_id and c.owner_user_id = auth.uid())
      )
  )
);

-- Write: only the event's creator owner (same tenant) or a super-admin.
create policy event_media_write on event_media_links for all using (
  app.is_super_admin() or exists (
    select 1 from events e join creators c on c.id = e.creator_id
    where e.id = event_media_links.event_id and c.owner_user_id = auth.uid()
  )
) with check (
  app.is_super_admin() or exists (
    select 1 from events e join creators c on c.id = e.creator_id
    where e.id = event_media_links.event_id
      and c.owner_user_id = auth.uid()
      and e.tenant_id = event_media_links.tenant_id
  )
);

-- ── Tenant media configuration (§9) ───────────────────────────────────────────
-- Defaults: media enabled, optional, external links allowed, inline embeds
-- allowed (app restricts embeds to explicitly-supported providers), no preferred
-- provider, empty allow-list = all providers allowed. YouTube is NOT a default.
alter table tenant_settings
  add column if not exists event_media_enabled boolean not null default true,
  add column if not exists event_media_optional boolean not null default true,
  add column if not exists external_media_links_enabled boolean not null default true,
  add column if not exists inline_embeds_enabled boolean not null default true,
  add column if not exists allowed_media_providers text[] not null default '{}'::text[],
  add column if not exists preferred_media_provider text;

-- ── Generic event creation (§3): no YouTube requirement, optional media ───────
-- Replaces the 0023 signature: p_youtube_url is gone; p_media is an optional jsonb
-- array of {url, provider, media_type, label, is_primary}. Publication is NEVER
-- blocked by missing media.
drop function if exists public.create_event_with_market(uuid, uuid, text, text, text, timestamptz, timestamptz, text, uuid[], text, boolean);

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
  values (v_tenant, v_event_id, coalesce(nullif(p_market_question, ''), 'Which competitor will win?'), 'SINGLE_CHOICE_WINNER', v_market_status, p_locks_at)
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

-- ── Remove the mandatory-YouTube guard (§3) ──────────────────────────────────
drop trigger if exists trg_protect_event_youtube_url on events;
drop function if exists app.protect_event_youtube_url();

-- ── Migrate existing YouTube URLs into the generic model (§8) ─────────────────
-- One primary media row per event that has a legacy youtube_url. Idempotent. The
-- legacy events.youtube_url column is retained for backward compatibility and is
-- scheduled for removal once all read paths use event_media_links (see docs).
insert into event_media_links (tenant_id, event_id, provider, media_type, url, is_primary)
select e.tenant_id, e.id, 'youtube', 'video'::event_media_type, btrim(e.youtube_url), true
from events e
where e.youtube_url is not null and btrim(e.youtube_url) <> ''
  and not exists (select 1 from event_media_links m where m.event_id = e.id);
