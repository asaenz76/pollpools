-- ============================================================================
-- 0076_draft_roster_visual_identity — surface competitor visual identity to Draft.
--
-- Extends the draft_roster RPC to return the competitor's visual_colors + identifier
-- (alongside the existing color/image_url) so Draft cards can render the shared
-- CompetitorMark. Return-type change requires drop + recreate. Behaviour is
-- otherwise identical (same rows, same order, same taken/drafters logic).
-- ============================================================================

drop function if exists public.draft_roster(uuid);

create function public.draft_roster(p_competition_id uuid)
returns table (competitor_id uuid, name text, color text, image_url text, visual_colors text[], identifier text, taken boolean, drafters bigint)
language sql stable security definer set search_path = public as $$
  with roster as (
    select distinct c.id, c.name, c.color, c.image_url, c.visual_colors, c.identifier
    from competitors c
    join event_competitors ec on ec.competitor_id = c.id
    join events e on e.id = ec.event_id and e.competition_id = p_competition_id
  )
  select r.id, r.name, r.color, r.image_url, r.visual_colors, r.identifier,
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
