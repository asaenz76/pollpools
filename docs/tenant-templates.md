# Tenant Template Library (Phase 8-D)

A Super Admin can create a new tenant from a reusable, versioned **configuration
blueprint**. A template is a project starter, not a parent object: once a tenant is
created it owns its configuration, and later template changes never touch it.

## What templates ARE

- Versioned bundles of **configuration** that map onto the EXISTING tenant systems
  (vocabulary, `tenant_settings`, feature flags, theme, providers, media,
  competition/market defaults, revenue eligibility) — plus an optional demo seed.
- Applied once, atomically, at tenant creation.

## What templates are NOT

- Not engine variants. There is **no** `if template === "…"` anywhere in the
  engine, no template-specific tables/columns, and no branching of settlement,
  billing, UI, or providers by template.
- Not live inheritance. A tenant is never re-synced from its template.

## Data model

- `tenant_templates` — one row per template (key, name, category, status, latest
  version, icon).
- `tenant_template_versions` — versioned blueprints (`configuration` + optional
  `seed_definition` JSONB, `engine_version`). Unique `(template_id, version)`.
- `tenant_template_assignments` — the immutable snapshot of exactly what was
  applied to a tenant (one per tenant).
- `tenants.template_id` / `tenants.template_version` — **nullable**. Existing/legacy
  tenants stay `null` and are never forced or rewritten.

## Versioning & immutability

- Draft → Published → Retired. A **published version is immutable** (a DB trigger
  rejects any edit/delete) — to change it, create a new version.
- Publishing a new version affects **future** tenant creation only. Tenants created
  from v1 keep their v1 snapshot when v2 is published (no silent migration).
- Retiring a template blocks new creation from it but never affects tenants already
  created from it.

## Application service

`create_tenant_from_template(p_template_version_id, p_identity, p_overrides,
p_include_demo, p_demo_owner)` is one transactional plpgsql function (super-admin /
service-role only). It validates the version is published and the template not
retired, maps the config onto the tenant systems, optionally seeds demo data, and
records the immutable assignment snapshot + an audit entry. **If any step fails the
whole thing rolls back** — no partial tenant, no orphan assignment.

## Allowed creation-time overrides

Only safe, tenant-level values: display name, slug, locale, timezone, logos, brand
colors, and permitted feature/provider toggles. **Never** settlement, billing, job,
Revenue-Plan percentage, security, or engine-version behavior.

## Validation (before publish)

Strict schema (rejects unknown keys) + explicit feature-compatibility checks:
supported engine version, providers/notification channels/media exist in the
registries, Draft ↔ competitors, revenue ↔ predictions, demo event needs ≥2
competitors. See `src/lib/templates/schema.ts`.

## Demo data

Optional. The Super Admin chooses "empty" or "with demo data" at creation. Demo
entities (a creator owned by the actor, competitors, an optional competition, and
an event + winner market) are created inside the same transaction. Never inserted
automatically into production tenants.

## Starter library

General Prediction Community · Club Sports · Racing Community · Competition/Awards ·
Cook-Off. Each is pure configuration proving breadth; only their vocabulary,
features, competition/market defaults, and Draft/revenue eligibility differ.

## How to add / publish / retire a template

1. `/admin/templates` → create a template (key, name, category).
2. Create a **draft** version (blank or copy a previous version); edit its
   configuration (structured preview; advanced JSON editor for the raw config).
3. **Publish** — validation runs; on success the version becomes immutable.
4. **Retire** a template when it's replaced; existing tenants are unaffected.
5. **Create tenant** from a published template via the create-tenant flow.

## Backwards compatibility

The template migrations are additive (new tables + nullable columns). Existing
tenants — manual, seeded, custom-domain, with Revenue Plan / Community Health /
billing / settlement history — continue to work unchanged with `template_id = null`.
Nothing is inferred or rewritten. Covered by `tests/integration/tenant-template-*`
plus the full existing suite.

## Security

Template create/edit/publish/retire and create-from-template are **Super Admin
only** (RLS + server authorization). A tenant may read only its own assignment, and
never another tenant's or a template's internal configuration.
