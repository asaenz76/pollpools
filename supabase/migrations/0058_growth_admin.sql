-- ============================================================================
-- 0058_growth_admin — Phase 8-B.5 GRE.6: super-admin audit wrapper for growth
-- configuration changes. Config tables (revenue_plans, revenue_plan_shares,
-- community_health_metrics/bands, platform_config) already enforce super-admin
-- writes via RLS; this only adds an auditable log entry helper the admin server
-- actions call after a validated change. No new commercial logic.
-- ============================================================================

create or replace function public.log_growth_change(
  p_action text, p_entity_type text, p_entity_id uuid, p_summary text, p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.is_super_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  perform app.write_audit(p_action, p_entity_type, p_entity_id, null, auth.uid(), p_summary, p_metadata);
end; $$;
grant execute on function public.log_growth_change(text, text, uuid, text, jsonb) to authenticated;
