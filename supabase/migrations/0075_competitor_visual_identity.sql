-- ============================================================================
-- 0075_competitor_visual_identity — generic competitor visual identity.
--
-- A competitor is no longer "one color". It may carry 0–4 identifying colors and
-- an optional short identifier (a number OR a label like "8", "A", "07"). This is
-- GENERIC — no marble/billiard/material/physical fields. Additive and backwards-
-- compatible: the legacy single `color` column is kept and migrated into
-- `visual_colors`, so existing competitors display exactly as before.
--
-- The competitor is the authoritative source; market options stay linked by
-- competitor_id and read the competitor's live visuals (no denormalized copy, no
-- change to create_event_with_market, one source of truth).
-- ============================================================================

-- Canonical validator: at most 4 colors, each a #RRGGBB hex (case-insensitive).
create or replace function app.valid_visual_colors(p_colors text[])
returns boolean language sql immutable as $$
  select p_colors is null or (
    coalesce(array_length(p_colors, 1), 0) <= 4
    and not exists (select 1 from unnest(p_colors) c where c !~ '^#[0-9A-Fa-f]{6}$')
  );
$$;

alter table competitors
  add column if not exists visual_colors text[] not null default '{}'::text[],
  add column if not exists identifier text;

-- Migrate the legacy single color into the array (nothing lost). Idempotent.
update competitors
   set visual_colors = array[color]
 where color is not null and coalesce(array_length(visual_colors, 1), 0) = 0;

alter table competitors
  add constraint competitors_visual_colors_ck check (app.valid_visual_colors(visual_colors)),
  add constraint competitors_identifier_ck check (identifier is null or char_length(identifier) between 1 and 6);

grant execute on function app.valid_visual_colors(text[]) to authenticated, service_role;
