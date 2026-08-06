-- ============================================================================
-- 0034 — Phase 7.5 §4: configuration-driven scoring (finding F-04).
--
-- Grading hard-coded `points := 1` for a correct pick and 0 otherwise, ignoring
-- the `scoring_rules` config table that already existed. This resolves the
-- scoring rule (competition rule → tenant default → global default) and grades
-- with its configured points. Points are stored on each immutable grade, so a
-- later rule change is picked up by the next settlement/regrade (reversible).
-- ============================================================================

-- Resolve the effective scoring config for an event's competition/tenant.
create or replace function app.resolve_scoring(p_tenant uuid, p_competition uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select sr.config from competitions c join scoring_rules sr on sr.id = c.scoring_rule_id where c.id = p_competition),
    (select config from scoring_rules where tenant_id = p_tenant and is_default limit 1),
    (select config from scoring_rules where tenant_id is null and is_default limit 1),
    '{"correct":1,"incorrect":0,"void":0}'::jsonb
  );
$$;

-- apply_grading now takes its points from the resolved scoring rule.
create or replace function app.apply_grading(
  p_settlement_id uuid, p_event_id uuid, p_version int, p_resolution text,
  p_winner uuid, p_tenant uuid, p_winning_option_ids uuid[]
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_market record; v_pred record; v_win_options uuid[]; v_outcome text; v_points int;
  v_comp uuid; v_scoring jsonb;
  v_correct int; v_incorrect int; v_void int;
begin
  select competition_id into v_comp from events where id = p_event_id;
  v_scoring := app.resolve_scoring(p_tenant, v_comp);
  v_correct := coalesce((v_scoring->>'correct')::int, 1);
  v_incorrect := coalesce((v_scoring->>'incorrect')::int, 0);
  v_void := coalesce((v_scoring->>'void')::int, 0);

  for v_market in select * from markets where event_id = p_event_id loop
    if p_resolution = 'settled' then
      if p_winning_option_ids is not null then
        select coalesce(array_agg(id), '{}') into v_win_options
          from market_options where market_id = v_market.id and id = any(p_winning_option_ids);
      else
        select coalesce(array_agg(id), '{}') into v_win_options
          from market_options where market_id = v_market.id and competitor_id = p_winner;
      end if;
      update market_options
        set status = (case when id = any(v_win_options) then 'winner' else 'loser' end)::option_status
        where market_id = v_market.id;
      update markets set status = 'settled' where id = v_market.id;
    else
      v_win_options := '{}';
      update market_options set status = 'voided' where market_id = v_market.id;
      update markets
        set status = (case when p_resolution = 'canceled' then 'canceled' else 'voided' end)::market_status
        where id = v_market.id;
    end if;

    for v_pred in select * from predictions where market_id = v_market.id loop
      if p_resolution <> 'settled' or array_length(v_win_options, 1) is null then
        v_outcome := 'void'; v_points := v_void;
      elsif v_pred.option_id = any(v_win_options) then
        v_outcome := 'correct'; v_points := v_correct;
      else
        v_outcome := 'incorrect'; v_points := v_incorrect;
      end if;

      insert into settlement_grades
        (tenant_id, settlement_id, event_id, grading_version, prediction_id, user_id, market_id, option_id, outcome, points)
      values (p_tenant, p_settlement_id, p_event_id, p_version, v_pred.id, v_pred.user_id, v_market.id, v_pred.option_id, v_outcome, v_points);

      update predictions
        set status = v_outcome::prediction_status, locked_at = coalesce(locked_at, now())
        where id = v_pred.id;
    end loop;
  end loop;
end; $$;
