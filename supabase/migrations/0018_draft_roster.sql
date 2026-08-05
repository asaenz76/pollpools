-- ============================================================================
-- 0018_draft_roster.sql  (Phase 4.5)
-- Availability view for the draft UI. Users cannot read others' assignments
-- (RLS), so availability is exposed as an aggregate (taken? / drafter count)
-- WITHOUT leaking who drafted whom.
-- ============================================================================

create or replace function public.draft_roster(p_competition_id uuid)
returns table (competitor_id uuid, name text, color text, image_url text, taken boolean, drafters bigint)
language sql stable security definer set search_path = public as $$
  with roster as (
    select distinct c.id, c.name, c.color, c.image_url
    from competitors c
    join event_competitors ec on ec.competitor_id = c.id
    join events e on e.id = ec.event_id and e.competition_id = p_competition_id
  )
  select r.id, r.name, r.color, r.image_url,
    exists (
      select 1 from competitor_draft_assignments a
      where a.competition_id = p_competition_id and a.competitor_id = r.id
        and a.exclusive_slot and a.status not in ('canceled', 'expired')
    ) as taken,
    (select count(*) from competitor_draft_assignments a
      where a.competition_id = p_competition_id and a.competitor_id = r.id
        and a.status not in ('canceled', 'expired')) as drafters
  from roster r
  order by r.name;
$$;

grant execute on function public.draft_roster(uuid) to anon, authenticated;
