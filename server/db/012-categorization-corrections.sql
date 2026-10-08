begin;
alter table public.document_uploads add constraint uploads_id_client_owner_key unique(id,client_id,bookkeeper_id);
create table public.categorization_corrections (
  id uuid primary key default gen_random_uuid(),
  bookkeeper_id uuid not null references public.bookkeepers(id) on delete cascade,
  client_id uuid not null,
  upload_id uuid,
  transaction_date date,
  transaction_amount_cents bigint,
  vendor_normalized text,
  description_raw text,
  original_category text,
  corrected_category text not null,
  original_subcategory text,
  corrected_subcategory text,
  reason text,
  status text not null default 'applied' check(status in ('applied','undone','auto_promoted')),
  applied_at timestamptz not null default now(),
  original_confidence text check(original_confidence in ('high','medium','low')),
  foreign key(client_id,bookkeeper_id) references public.clients(id,bookkeeper_id) on delete cascade,
  foreign key(upload_id,client_id,bookkeeper_id) references public.document_uploads(id,client_id,bookkeeper_id) on delete set null (upload_id)
);
create index corrections_owner_applied_idx on public.categorization_corrections(bookkeeper_id,applied_at desc);
create index corrections_owner_vendor_idx on public.categorization_corrections(bookkeeper_id,vendor_normalized);
create index corrections_client_applied_idx on public.categorization_corrections(client_id,applied_at desc);
alter table public.categorization_corrections enable row level security;
alter table public.categorization_corrections force row level security;
revoke all on public.categorization_corrections from public;
grant select on public.categorization_corrections to bookdrop_app;
grant insert(id,bookkeeper_id,client_id,upload_id,transaction_date,transaction_amount_cents,vendor_normalized,description_raw,original_category,corrected_category,original_subcategory,corrected_subcategory,reason,original_confidence) on public.categorization_corrections to bookdrop_app;
grant update(status) on public.categorization_corrections to bookdrop_app;
create policy corrections_owner_read on public.categorization_corrections for select to bookdrop_app
  using(bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=categorization_corrections.client_id));
create policy corrections_owner_insert on public.categorization_corrections for insert to bookdrop_app
  with check(status='applied' and bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=categorization_corrections.client_id));
create policy corrections_owner_undo on public.categorization_corrections for update to bookdrop_app
  using(bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=categorization_corrections.client_id))
  with check(status='undone' and bookkeeper_id=app_private.bookkeeper_id() and exists(select 1 from public.clients c where c.id=categorization_corrections.client_id));
commit;
