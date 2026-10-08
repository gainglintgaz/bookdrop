-- Upload metadata only. Private object bytes and portal authorization are a
-- separate migration contract; no public grants or simulated storage here.
begin;
alter table public.document_requirements add constraint requirements_id_client_key unique (id, client_id);
create table public.document_uploads (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null,
  client_id uuid not null,
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  filename_original text not null,
  storage_path text not null,
  file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
  uploaded_at timestamptz not null default now(),
  auto_categorized_at timestamptz,
  auto_categorization_confidence text check (auto_categorization_confidence in ('high','medium','low')),
  client_confirmed_at timestamptz,
  parsed_summary jsonb,
  categorization_summary jsonb,
  foreign key (requirement_id, client_id) references public.document_requirements(id, client_id) on delete cascade,
  foreign key (client_id, bookkeeper_id) references public.clients(id, bookkeeper_id) on delete cascade
);
create index uploads_client_period_idx on public.document_uploads(client_id, period_year, period_month);
create index uploads_owner_idx on public.document_uploads(bookkeeper_id);
create index uploads_requirement_idx on public.document_uploads(requirement_id);
alter table public.document_uploads enable row level security;
alter table public.document_uploads force row level security;
create policy uploads_owner on public.document_uploads to bookdrop_app
  using (bookkeeper_id=app_private.bookkeeper_id() and exists (select 1 from public.clients c where c.id=document_uploads.client_id))
  with check (bookkeeper_id=app_private.bookkeeper_id() and exists (select 1 from public.clients c where c.id=document_uploads.client_id));
-- Browser-facing API has no metadata write operation until the object adapter
-- can verify the object, ownership, size and hash together.
grant select on public.document_uploads to bookdrop_app;
commit;
