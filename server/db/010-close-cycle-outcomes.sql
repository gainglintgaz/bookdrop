-- Preserve migration 004's per-client outcome contract. Import/migration owner
-- may restore historical rows; browser roles cannot fabricate closed cycles.
begin;
create table public.close_cycle_outcomes (
  id uuid primary key default gen_random_uuid(),
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  client_id uuid not null,
  period_year integer not null,
  period_month integer not null check(period_month between 1 and 12),
  hours_saved_minutes integer default 0,
  accuracy_pct numeric(5,2),
  reconciliation_match_pct numeric(5,2),
  total_categorized integer default 0,
  total_corrected integer default 0,
  total_anomalies_flagged integer default 0,
  total_anomalies_real integer default 0,
  notes text,
  worth_it boolean,
  signed_off_at timestamptz not null default now(),
  unique(client_id,period_year,period_month),
  foreign key(client_id,bookkeeper_id) references public.clients(id,bookkeeper_id) on delete cascade
);
create index close_outcomes_bookkeeper_idx on public.close_cycle_outcomes(bookkeeper_id,signed_off_at desc);
create index close_outcomes_client_idx on public.close_cycle_outcomes(client_id,period_year desc,period_month desc);
alter table public.close_cycle_outcomes enable row level security;
alter table public.close_cycle_outcomes force row level security;
revoke all on public.close_cycle_outcomes from public;
grant select on public.close_cycle_outcomes to bookdrop_app;
create policy close_outcomes_owner_read on public.close_cycle_outcomes for select to bookdrop_app
  using(bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=close_cycle_outcomes.client_id));
commit;
