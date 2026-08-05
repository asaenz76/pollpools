-- ============================================================================
-- 0008_brackets.sql
-- Single-elimination bracket structure (spec §8). A bracket is a competition of
-- type BRACKET. `bracket_slots` models the bracket tree: each slot is a MATCHUP
-- node holding its two competitors and pointers to the two feeder matchups whose
-- winners fill it. Advancement is by relationship — no competitor duplication.
-- ============================================================================

create table bracket_rounds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  round_number integer not null,
  name text not null,
  size integer not null,               -- competitors entering this round
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, round_number)
);
create index idx_bracket_rounds_competition on bracket_rounds (competition_id, round_number);

create trigger trg_bracket_rounds_updated_at
  before update on bracket_rounds
  for each row execute function app.set_updated_at();

create table bracket_slots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  competition_id uuid not null references competitions (id) on delete cascade,
  round_id uuid not null references bracket_rounds (id) on delete cascade,
  match_index integer not null,        -- global index (mirrors bracket.ts)
  position integer not null,           -- position within the round
  event_id uuid references events (id) on delete set null,
  competitor_a_id uuid references competitors (id) on delete set null,
  competitor_b_id uuid references competitors (id) on delete set null,
  source_a_id uuid references bracket_slots (id) on delete set null,
  source_b_id uuid references bracket_slots (id) on delete set null,
  winner_competitor_id uuid references competitors (id) on delete set null,
  is_bye boolean not null default false,
  bye_competitor_id uuid references competitors (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'decided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, match_index)
);
create index idx_bracket_slots_competition on bracket_slots (competition_id, match_index);
create index idx_bracket_slots_round on bracket_slots (round_id, position);
create index idx_bracket_slots_event on bracket_slots (event_id);
create index idx_bracket_slots_source_a on bracket_slots (source_a_id);
create index idx_bracket_slots_source_b on bracket_slots (source_b_id);

create trigger trg_bracket_slots_updated_at
  before update on bracket_slots
  for each row execute function app.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: visible with their (non-draft) competition; written only via the bracket
-- functions (SECURITY DEFINER) / service role — no direct client write policy.
-- ----------------------------------------------------------------------------
alter table bracket_rounds enable row level security;
alter table bracket_slots  enable row level security;

create policy bracket_rounds_select on bracket_rounds for select
  using (
    app.is_super_admin()
    or exists (
      select 1 from competitions c
      where c.id = competition_id
        and (c.status <> 'draft' or app.owns_creator(c.creator_id))
    )
  );

create policy bracket_slots_select on bracket_slots for select
  using (
    app.is_super_admin()
    or exists (
      select 1 from competitions c
      where c.id = competition_id
        and (c.status <> 'draft' or app.owns_creator(c.creator_id))
    )
  );
