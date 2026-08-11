-- ============================================================================
-- 0073_tenant_publication — self-service tenant publication lifecycle (PL.4).
--
-- Anti-junk guardrail for self-service communities. A self-created tenant is fully
-- OPERABLE from the start (status stays 'active' — unlisted is NOT suspended) but
-- is absent from platform discovery until the owner deliberately publishes it once
-- objective criteria are met. Listing is a separate dimension (`tenants.listed`),
-- never the status enum, so an unlisted tenant resolves and works normally by
-- direct URL. Legacy + admin-created tenants keep `listed = true` (default), so
-- nothing already live changes.
--
-- Publication eligibility is objective and minimal (spec §24): verified owner
-- email, a name, a description, and at least one published event. Community Health,
-- Revenue Plan, WAU, and custom domains deliberately do NOT gate publication.
-- ============================================================================

alter table tenants add column if not exists listed boolean not null default true;

-- Self-service communities start UNLISTED. Re-created from 0071 with that one line;
-- all other behavior is identical (owner-scoped, guardrailed, atomic).
create or replace function public.create_pollpool(
  p_template_version_id uuid,
  p_identity jsonb,
  p_overrides jsonb default '{}'::jsonb,
  p_include_demo boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_result jsonb; v_tenant uuid; v_owned int; v_cap int := 10;
begin
  if v_user is null or coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select count(distinct tenant_id) into v_owned from creators where owner_user_id = v_user;
  if v_owned >= v_cap then raise exception 'TENANT_LIMIT_REACHED' using errcode = '22000'; end if;

  v_result := app.provision_tenant_from_template(v_user, p_template_version_id, p_identity, p_overrides, p_include_demo, v_user);
  v_tenant := (v_result->>'tenant_id')::uuid;

  -- Self-service communities are unlisted until the owner publishes them.
  update tenants set listed = false where id = v_tenant;

  insert into tenant_memberships (tenant_id, user_id, role, status)
  values (v_tenant, v_user, 'creator', 'active')
  on conflict (tenant_id, user_id) do update set role = 'creator', status = 'active';

  if not exists (select 1 from creators where tenant_id = v_tenant and owner_user_id = v_user) then
    insert into creators (tenant_id, owner_user_id, display_name, slug, verification_status)
    values (v_tenant, v_user, coalesce(nullif(p_identity->>'creator_name', ''), p_identity->>'display_name'),
      'owner-' || substr(v_tenant::text, 1, 8), 'pending');
  end if;

  return v_result;
end; $$;

-- Objective publication eligibility. Authz: super-admin or a creator-owner here.
create or replace function public.pollpool_publish_eligibility(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_name boolean; v_desc boolean; v_event boolean; v_email boolean; v_listed boolean;
begin
  if not (app.is_super_admin() or exists (select 1 from creators c where c.tenant_id = p_tenant and c.owner_user_id = auth.uid())) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select btrim(coalesce(display_name, '')) <> '', btrim(coalesce(description, '')) <> '', listed
    into v_name, v_desc, v_listed from tenants where id = p_tenant;
  -- At least one non-draft (published/open/…/settled) event.
  v_event := exists (select 1 from events e where e.tenant_id = p_tenant and e.status <> 'draft');
  -- At least one creator-owner with a verified auth email.
  v_email := exists (
    select 1 from creators c join auth.users u on u.id = c.owner_user_id
    where c.tenant_id = p_tenant and u.email_confirmed_at is not null
  );
  return jsonb_build_object(
    'eligible', coalesce(v_name, false) and coalesce(v_desc, false) and v_event and v_email,
    'listed', coalesce(v_listed, false),
    'checks', jsonb_build_object(
      'owner_email_verified', v_email, 'name', coalesce(v_name, false),
      'description', coalesce(v_desc, false), 'has_published_event', v_event));
end; $$;
grant execute on function public.pollpool_publish_eligibility(uuid) to authenticated, service_role;

-- Deliberate publication (owner-triggered). Objective criteria only — no admin
-- approval, no Health/plan/WAU/domain gating.
create or replace function public.publish_pollpool(p_tenant uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_elig jsonb;
begin
  v_elig := public.pollpool_publish_eligibility(p_tenant); -- enforces authz + criteria
  if not (v_elig->>'eligible')::boolean then raise exception 'NOT_ELIGIBLE' using errcode = '22000'; end if;
  update tenants set listed = true where id = p_tenant;
  perform app.write_audit('tenant.published', 'tenant', p_tenant, p_tenant, auth.uid(), 'PollPool published to discovery', '{}'::jsonb);
  return jsonb_build_object('tenant_id', p_tenant, 'listed', true);
end; $$;
grant execute on function public.publish_pollpool(uuid) to authenticated, service_role;
