-- ============================================================================
-- 0031 — Phase 7.5 §14: Configuration Engine foundation + finding F-11.
--
-- Prediction Engine already resolves configuration at three tiers — feature
-- flags (tenant_feature_flags), typed tenant settings (tenant_settings), and
-- record-level rules (scoring_rules, creator_revenue_rules). What was missing is
-- a PLATFORM-DEFAULT tier those tiers fall back to, so defaults lived as literals
-- in code/SQL (e.g. the 80/20 revenue split in resolve_revenue_split — F-11).
--
-- This adds a single `platform_config` row as that platform-default tier and
-- points revenue-split resolution at it. It is NOT a generic config DSL: it holds
-- the specific platform defaults that have a real consumer, plus a `config` JSONB
-- escape hatch for future platform defaults (added as their consumers arrive).
--
-- Resolution order (unchanged in spirit, now with a real bottom tier):
--   record rule → tenant setting → platform default
-- ============================================================================

create table platform_config (
  -- Single-row table: the boolean PK pinned to true admits exactly one row.
  id boolean primary key default true,
  default_creator_share_bps integer not null default 8000 check (default_creator_share_bps between 0 and 10000),
  default_platform_share_bps integer not null default 2000 check (default_platform_share_bps between 0 and 10000),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint chk_platform_config_singleton check (id = true),
  constraint chk_platform_config_split check (default_creator_share_bps + default_platform_share_bps = 10000)
);

insert into platform_config (id) values (true) on conflict (id) do nothing;

alter table platform_config enable row level security;
-- Platform defaults are non-sensitive and world-readable; only a super admin writes.
create policy platform_config_read on platform_config for select using (true);
create policy platform_config_write on platform_config for update using (app.is_super_admin()) with check (app.is_super_admin());

create trigger trg_platform_config_updated_at
  before update on platform_config
  for each row execute function app.set_updated_at();

-- F-11 — revenue split falls back to the platform default, not a hard-coded literal.
create or replace function app.resolve_revenue_split(p_tenant uuid, p_creator uuid, p_type billing_product_type)
returns table (creator_bps int, platform_bps int)
language sql stable security definer set search_path = public as $$
  select coalesce(r.creator_share_basis_points, s.creator_share_bps, pc.default_creator_share_bps),
         coalesce(r.platform_share_basis_points, s.platform_share_bps, pc.default_platform_share_bps)
  from (select 1) one
  left join lateral (
    select creator_share_basis_points, platform_share_basis_points
    from creator_revenue_rules rr
    where rr.tenant_id = p_tenant and rr.creator_id = p_creator and rr.product_type = p_type
      and rr.effective_from <= now() and (rr.effective_to is null or rr.effective_to > now())
    order by rr.effective_from desc limit 1
  ) r on true
  left join tenant_settings s on s.tenant_id = p_tenant
  left join platform_config pc on pc.id;
$$;
