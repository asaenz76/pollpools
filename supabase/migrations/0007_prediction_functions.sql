-- ============================================================================
-- 0007_prediction_functions.sql
-- The transactional heart of the prediction engine.
--   * submit_prediction  — the ONLY path that writes a prediction. Enforces
--     server-time locking, one-per-market, editing rules, immutable revision
--     history, and idempotency. Serialized per (market,user) via advisory lock.
--   * market_sentiment    — aggregate vote counts per option (bypasses per-user
--     RLS so community sentiment can be shown without exposing individual picks).
--   * lock_due_markets     — maintenance: flip open→locked once locks_at passes.
-- ============================================================================

create or replace function public.submit_prediction(
  p_market_id uuid,
  p_option_id uuid,
  p_idempotency_key text,
  p_source text default 'web'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_market markets%rowtype;
  v_event events%rowtype;
  v_option market_options%rowtype;
  v_existing predictions%rowtype;
  v_pred predictions%rowtype;
  v_tenant uuid;
  v_locks_at timestamptz;
  v_editing boolean;
  v_prior jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode = '22000';
  end if;

  -- Fast idempotency short-circuit.
  select response into v_prior from idempotency_records
    where scope = 'prediction' and idempotency_key = p_idempotency_key;
  if found then return v_prior; end if;

  select * into v_market from markets where id = p_market_id;
  if not found then raise exception 'MARKET_NOT_FOUND' using errcode = 'P0002'; end if;
  v_tenant := v_market.tenant_id;

  -- Serialize concurrent submissions for the same user+market only.
  perform pg_advisory_xact_lock(hashtextextended(p_market_id::text || ':' || v_user::text, 0));

  -- Re-check idempotency now that we hold the lock.
  select response into v_prior from idempotency_records
    where scope = 'prediction' and idempotency_key = p_idempotency_key;
  if found then return v_prior; end if;

  select * into v_event from events where id = v_market.event_id;

  -- Suspended / deleted accounts cannot submit.
  if exists (select 1 from users u where u.id = v_user and u.status <> 'active') then
    raise exception 'ACCOUNT_NOT_ACTIVE' using errcode = '28000';
  end if;
  -- Must be an active member of the market's tenant.
  if not exists (
    select 1 from tenant_memberships m
    where m.tenant_id = v_tenant and m.user_id = v_user and m.status = 'active'
  ) then
    raise exception 'NOT_A_MEMBER' using errcode = '42501';
  end if;

  -- Market must be open, and server time must be before lock. Client time is
  -- never consulted — the gate is now() on the database.
  if v_market.status <> 'open' then raise exception 'MARKET_NOT_OPEN' using errcode = '22000'; end if;
  v_locks_at := coalesce(v_market.locks_at, v_event.locks_at);
  if v_locks_at is not null and now() >= v_locks_at then
    raise exception 'MARKET_LOCKED' using errcode = '22000';
  end if;

  -- Option must belong to this market and be active.
  select * into v_option from market_options
    where id = p_option_id and market_id = p_market_id and status = 'active';
  if not found then raise exception 'INVALID_OPTION' using errcode = '22000'; end if;

  -- Editing-before-lock flag (defaults to true when unset).
  select coalesce(
    (select enabled from tenant_feature_flags
     where tenant_id = v_tenant and flag = 'prediction_editing_before_lock_enabled'),
    true
  ) into v_editing;

  select * into v_existing from predictions where market_id = p_market_id and user_id = v_user;

  if found then
    if v_existing.status <> 'active' then
      raise exception 'PREDICTION_LOCKED' using errcode = '22000';
    elsif v_existing.option_id = p_option_id then
      v_pred := v_existing;  -- No-op change; idempotent.
    elsif not v_editing then
      raise exception 'EDITING_DISABLED' using errcode = '22000';
    else
      update predictions
        set option_id = p_option_id, last_changed_at = now(), source = p_source
        where id = v_existing.id
        returning * into v_pred;
      insert into prediction_revisions (tenant_id, prediction_id, market_id, user_id, option_id, source)
        values (v_tenant, v_pred.id, p_market_id, v_user, p_option_id, p_source);
    end if;
  else
    insert into predictions
      (tenant_id, market_id, user_id, option_id, original_option_id, source, idempotency_key, status)
      values (v_tenant, p_market_id, v_user, p_option_id, p_option_id, p_source, p_idempotency_key, 'active')
      returning * into v_pred;
    insert into prediction_revisions (tenant_id, prediction_id, market_id, user_id, option_id, source)
      values (v_tenant, v_pred.id, p_market_id, v_user, p_option_id, p_source);
  end if;

  insert into idempotency_records (tenant_id, scope, idempotency_key, response, status)
    values (v_tenant, 'prediction', p_idempotency_key, to_jsonb(v_pred), 'completed')
    on conflict (scope, idempotency_key) do nothing;

  return to_jsonb(v_pred);
end;
$$;

-- ----------------------------------------------------------------------------
-- market_sentiment — per-option vote counts + total. Counts VALID predictions
-- only (excludes void). Returns every active option, including zero-vote ones.
-- ----------------------------------------------------------------------------
create or replace function public.market_sentiment(p_market_id uuid)
returns table (option_id uuid, label text, display_order integer, votes bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select o.id, o.label, o.display_order,
           count(p.id) filter (where p.status <> 'void') as votes
    from market_options o
    left join predictions p
      on p.option_id = o.id and p.market_id = p_market_id
    where o.market_id = p_market_id and o.status = 'active'
    group by o.id, o.label, o.display_order
  )
  select id, label, display_order, votes,
         coalesce(sum(votes) over (), 0) as total
  from counts
  order by display_order, id;
$$;

-- ----------------------------------------------------------------------------
-- lock_due_markets — maintenance job (service role only). Idempotent.
-- ----------------------------------------------------------------------------
create or replace function public.lock_due_markets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update markets set status = 'locked'
    where status = 'open' and locks_at is not null and now() >= locks_at;
  get diagnostics v_count = row_count;

  update events set status = 'locked'
    where status = 'open' and locks_at is not null and now() >= locks_at;

  return v_count;
end;
$$;

-- Explicit execute grants. Postgres grants EXECUTE to PUBLIC by default; we
-- lock down the maintenance function to the service role.
grant execute on function public.submit_prediction(uuid, uuid, text, text) to authenticated;
grant execute on function public.market_sentiment(uuid) to anon, authenticated;
revoke all on function public.lock_due_markets() from public;
grant execute on function public.lock_due_markets() to service_role;
