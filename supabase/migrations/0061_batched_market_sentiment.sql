-- ============================================================================
-- 0061_batched_market_sentiment — Phase 8-C F-17: batched sentiment read.
--
-- The event page previously called market_sentiment(uuid) once PER market (an
-- N+1). This adds a set-based batched variant so the whole event resolves its
-- sentiment in a single query. Same counting semantics as market_sentiment
-- (non-void predictions per active option, per-market total). Read-only; no
-- settlement/aggregate maintenance — reconciliation is unaffected.
-- ============================================================================

create or replace function public.markets_sentiment(p_market_ids uuid[])
returns table (market_id uuid, option_id uuid, label text, display_order integer, votes bigint, total bigint)
language sql stable security definer set search_path = public as $$
  with counts as (
    select o.market_id, o.id as option_id, o.label, o.display_order,
           count(p.id) filter (where p.status <> 'void') as votes
    from market_options o
    left join predictions p
      on p.option_id = o.id and p.market_id = o.market_id
    where o.market_id = any(p_market_ids) and o.status = 'active'
    group by o.market_id, o.id, o.label, o.display_order
  )
  select market_id, option_id, label, display_order, votes,
         coalesce(sum(votes) over (partition by market_id), 0) as total
  from counts
  order by market_id, display_order, option_id;
$$;

grant execute on function public.markets_sentiment(uuid[]) to anon, authenticated, service_role;
