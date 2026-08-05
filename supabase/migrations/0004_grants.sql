-- ============================================================================
-- 0004_grants.sql
-- Table-level privileges for the PostgREST roles. RLS remains the row-level
-- gate; these grants only allow the roles to reach the tables at all.
--   * service_role  → full access (bypasses RLS; trusted server code only)
--   * authenticated → DML, but every row is still constrained by RLS policies
--   * anon          → read-only, still constrained by RLS policies
-- Default privileges keep future (later-phase) tables consistent.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
