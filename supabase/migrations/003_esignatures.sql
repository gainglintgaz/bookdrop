-- ============================================================================
-- BookDrop Migration 003 — E-Signatures
-- Adds engagement_letters and signatures tables
-- ============================================================================

-- Engagement letters: PDFs a bookkeeper uploads for clients to sign
create table if not exists engagement_letters (
  id              uuid primary key default gen_random_uuid(),
  bookkeeper_id   uuid not null references bookkeepers(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  label           text not null,
  storage_path    text not null,
  filename        text not null,
  file_size_bytes bigint not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists engagement_letters_client_idx
  on engagement_letters(client_id);
create index if not exists engagement_letters_bookkeeper_idx
  on engagement_letters(bookkeeper_id);

alter table engagement_letters enable row level security;

create policy "engagement_letters_owner_all" on engagement_letters
  for all using (auth.uid() = bookkeeper_id);

create policy "engagement_letters_public_read" on engagement_letters
  for select to anon using (true);

-- Signatures: records of clients signing engagement letters
create table if not exists signatures (
  id                    uuid primary key default gen_random_uuid(),
  engagement_letter_id  uuid not null references engagement_letters(id) on delete cascade,
  client_id             uuid not null references clients(id) on delete cascade,
  bookkeeper_id         uuid not null references bookkeepers(id) on delete cascade,
  signed_at             timestamptz not null default now(),
  signer_name           text not null,
  signer_email          text not null,
  signature_image_data  text not null,
  signed_pdf_path       text,
  ip_address            text,
  portal_token_used     text not null
);

create index if not exists signatures_letter_idx
  on signatures(engagement_letter_id);
create index if not exists signatures_client_idx
  on signatures(client_id);
create index if not exists signatures_bookkeeper_idx
  on signatures(bookkeeper_id);

alter table signatures enable row level security;

create policy "signatures_owner_all" on signatures
  for all using (auth.uid() = bookkeeper_id);

create policy "signatures_public_insert" on signatures
  for insert to anon with check (true);
