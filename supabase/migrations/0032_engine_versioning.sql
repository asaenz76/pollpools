-- ============================================================================
-- 0032 — Phase 7.5 §13: versioned Engine API.
--
-- Every tenant is pinned to a specific engine version — never "latest" — so a
-- future change to settlement / scoring / grading / statistics / leaderboards /
-- draft behavior can be gated by version and NEVER silently changes an existing
-- tenant's results. New tenants are created at the current version (a snapshot),
-- not auto-upgraded.
--
-- This slice establishes the storage + the "never latest" guarantee + the
-- platform default. The engine reads the resolved version; behavior branches are
-- added by the slices that introduce versioned behavior (§3/§4 grading & scoring,
-- §5/§6 settlement), each gating on the tenant's pinned version.
-- ============================================================================

-- Platform default engine version (the version new tenants snapshot to).
alter table platform_config add column default_engine_version text not null default '1.0';

-- Per-tenant pinned version. The regex enforces an X.Y number and structurally
-- REJECTS 'latest' (or any non-numeric value).
alter table tenants add column engine_version text not null default '1.0'
  constraint chk_tenant_engine_version check (engine_version ~ '^[0-9]+\.[0-9]+$');
