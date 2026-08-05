-- ============================================================================
-- 0021_public_history.sql  (Phase 5)
-- Public prediction history for profiles. Individual predictions are owner-only
-- under RLS; this SECURITY DEFINER function exposes only SETTLED predictions
-- (no pre-lock pick leak) and only when the profile is public.
-- ============================================================================

create or replace function public.public_user_history(p_tenant uuid, p_user uuid)
returns table (event_title text, event_slug text, option_label text, outcome text, submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.title, e.slug, mo.label, p.status::text, p.submitted_at
  from predictions p
  join markets m on m.id = p.market_id
  join events e on e.id = m.event_id
  join market_options mo on mo.id = p.option_id
  join profiles pr on pr.tenant_id = p.tenant_id and pr.user_id = p.user_id
  where p.tenant_id = p_tenant and p.user_id = p_user
    and pr.is_public = true
    and p.status in ('correct', 'incorrect', 'void')
  order by p.submitted_at desc
  limit 50;
$$;

grant execute on function public.public_user_history(uuid, uuid) to anon, authenticated;
