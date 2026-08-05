-- ============================================================================
-- 0006_prediction_rls.sql
-- RLS for the Phase 2 prediction domain. Public/published content is world-
-- readable (scoped to active tenants); mutations are restricted to the owning
-- creator or a super admin. Predictions are readable only by their owner, and
-- are WRITTEN ONLY through the submit_prediction function (0007) — there is no
-- direct client insert/update policy on predictions by design.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Ownership helpers (SECURITY DEFINER, like the Phase 1 helpers).
-- ----------------------------------------------------------------------------
create or replace function app.owns_event(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events e
    join creators c on c.id = e.creator_id
    where e.id = p_event and c.owner_user_id = auth.uid()
  );
$$;

create or replace function app.owns_market(p_market uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from markets m
    join events e on e.id = m.event_id
    join creators c on c.id = e.creator_id
    where m.id = p_market and c.owner_user_id = auth.uid()
  );
$$;

create or replace function app.event_is_public(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e where e.id = p_event and e.status <> 'draft');
$$;

grant execute on function
  app.owns_event(uuid), app.owns_market(uuid), app.event_is_public(uuid)
to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Enable RLS.
-- ----------------------------------------------------------------------------
alter table scoring_rules         enable row level security;
alter table competitions          enable row level security;
alter table competition_stages    enable row level security;
alter table competitors           enable row level security;
alter table events                enable row level security;
alter table event_competitors     enable row level security;
alter table markets               enable row level security;
alter table market_options        enable row level security;
alter table predictions           enable row level security;
alter table prediction_revisions  enable row level security;

-- ----------------------------------------------------------------------------
-- scoring_rules — readable (needed to display scoring); writable by super admin.
-- ----------------------------------------------------------------------------
create policy scoring_rules_select on scoring_rules for select using (true);
create policy scoring_rules_write on scoring_rules for all
  using (app.is_super_admin()) with check (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- competitions
-- ----------------------------------------------------------------------------
create policy competitions_select on competitions for select
  using (status <> 'draft' or app.owns_creator(creator_id) or app.is_super_admin());
create policy competitions_insert on competitions for insert
  with check (app.owns_creator(creator_id) or app.is_super_admin());
create policy competitions_update on competitions for update
  using (app.owns_creator(creator_id) or app.is_super_admin())
  with check (app.owns_creator(creator_id) or app.is_super_admin());
create policy competitions_delete on competitions for delete
  using (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- competition_stages — visible with their competition; managed by its creator.
-- ----------------------------------------------------------------------------
create policy stages_select on competition_stages for select
  using (
    app.is_super_admin()
    or exists (
      select 1 from competitions c
      where c.id = competition_id
        and (c.status <> 'draft' or app.owns_creator(c.creator_id))
    )
  );
create policy stages_write on competition_stages for all
  using (
    app.is_super_admin()
    or exists (select 1 from competitions c where c.id = competition_id and app.owns_creator(c.creator_id))
  )
  with check (
    app.is_super_admin()
    or exists (select 1 from competitions c where c.id = competition_id and app.owns_creator(c.creator_id))
  );

-- ----------------------------------------------------------------------------
-- competitors — public content of active tenants; managed by owning creator.
-- ----------------------------------------------------------------------------
create policy competitors_select on competitors for select
  using (
    app.is_super_admin()
    or (creator_id is not null and app.owns_creator(creator_id))
    or exists (select 1 from tenants t where t.id = tenant_id and t.status = 'active')
  );
create policy competitors_write on competitors for all
  using (app.is_super_admin() or (creator_id is not null and app.owns_creator(creator_id)))
  with check (app.is_super_admin() or (creator_id is not null and app.owns_creator(creator_id)));

-- ----------------------------------------------------------------------------
-- events — non-draft events are public; managed by owning creator.
-- ----------------------------------------------------------------------------
create policy events_select on events for select
  using (status <> 'draft' or app.owns_creator(creator_id) or app.is_super_admin());
create policy events_insert on events for insert
  with check (app.owns_creator(creator_id) or app.is_super_admin());
create policy events_update on events for update
  using (app.owns_creator(creator_id) or app.is_super_admin())
  with check (app.owns_creator(creator_id) or app.is_super_admin());
create policy events_delete on events for delete
  using (app.is_super_admin());

-- ----------------------------------------------------------------------------
-- event_competitors
-- ----------------------------------------------------------------------------
create policy event_competitors_select on event_competitors for select
  using (app.owns_event(event_id) or app.is_super_admin() or app.event_is_public(event_id));
create policy event_competitors_write on event_competitors for all
  using (app.owns_event(event_id) or app.is_super_admin())
  with check (app.owns_event(event_id) or app.is_super_admin());

-- ----------------------------------------------------------------------------
-- markets
-- ----------------------------------------------------------------------------
create policy markets_select on markets for select
  using (app.owns_event(event_id) or app.is_super_admin() or app.event_is_public(event_id));
create policy markets_write on markets for all
  using (app.owns_event(event_id) or app.is_super_admin())
  with check (app.owns_event(event_id) or app.is_super_admin());

-- ----------------------------------------------------------------------------
-- market_options
-- ----------------------------------------------------------------------------
create policy market_options_select on market_options for select
  using (app.owns_market(market_id) or app.is_super_admin() or exists (
    select 1 from markets m where m.id = market_id and app.event_is_public(m.event_id)
  ));
create policy market_options_write on market_options for all
  using (app.owns_market(market_id) or app.is_super_admin())
  with check (app.owns_market(market_id) or app.is_super_admin());

-- ----------------------------------------------------------------------------
-- predictions — owner-readable only. Individual picks are NEVER world-readable
-- (community sentiment is exposed via an aggregate function). Writes go through
-- submit_prediction (SECURITY DEFINER); no direct client write policy exists.
-- ----------------------------------------------------------------------------
create policy predictions_select on predictions for select
  using (user_id = auth.uid() or app.is_super_admin());

create policy prediction_revisions_select on prediction_revisions for select
  using (user_id = auth.uid() or app.is_super_admin());
