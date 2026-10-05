-- 011_workflow_playbooks.sql
-- Phase 4: editable playbooks (allowlist step composition) + run audit trail.
-- Additive only. Soft-delete on playbooks; runs are append-oriented.
-- Advisors: run get_advisors after apply on live project.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) workflow_playbooks
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists workflow_playbooks (
  id              uuid primary key default gen_random_uuid(),
  bookkeeper_id   uuid not null references bookkeepers(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  description     text not null default '' check (char_length(description) <= 400),
  -- Ordered allowlist step ids (validated app-side against PLAYBOOK_STEP_IDS).
  step_ids        jsonb not null default '[]'::jsonb,
  is_default      boolean not null default false,
  is_system       boolean not null default false,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists workflow_playbooks_owner_idx
  on workflow_playbooks(bookkeeper_id)
  where deleted_at is null;

comment on table workflow_playbooks is
  'Bookkeeper-owned ordered compositions of allowlisted close-prep steps. Soft-delete only.';

alter table workflow_playbooks enable row level security;

create policy "workflow_playbooks_owner_all" on workflow_playbooks
  for all
  using (auth.uid() = bookkeeper_id)
  with check (auth.uid() = bookkeeper_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) workflow_runs (audit)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists workflow_runs (
  id                uuid primary key default gen_random_uuid(),
  playbook_id       uuid references workflow_playbooks(id) on delete set null,
  playbook_name     text not null,
  bookkeeper_id     uuid not null references bookkeepers(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  period_year       int not null check (period_year between 2000 and 2100),
  period_month      int not null check (period_month between 1 and 12),
  step_results      jsonb not null default '[]'::jsonb,
  status            text not null check (status in ('complete', 'partial', 'failed')),
  started_at        timestamptz not null,
  completed_at      timestamptz not null,
  alerts            jsonb not null default '[]'::jsonb,
  engine_version    text not null default 'playbook-v1',
  readiness_score   int check (readiness_score is null or readiness_score between 0 and 100),
  created_at        timestamptz not null default now()
);

create index if not exists workflow_runs_owner_client_idx
  on workflow_runs(bookkeeper_id, client_id, started_at desc);

create index if not exists workflow_runs_playbook_idx
  on workflow_runs(playbook_id, started_at desc);

comment on table workflow_runs is
  'Append-oriented audit of playbook executions. Survives playbook soft-delete.';

alter table workflow_runs enable row level security;

create policy "workflow_runs_owner_all" on workflow_runs
  for all
  using (auth.uid() = bookkeeper_id)
  with check (auth.uid() = bookkeeper_id);

-- Grants for PostgREST (safe if already granted via defaults)
grant select, insert, update, delete on workflow_playbooks to authenticated;
grant select, insert on workflow_runs to authenticated;
