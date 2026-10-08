-- Existing imported rows remain nullable until their archived bytes are verified.
-- New writes must supply integrity metadata through the private file API.
begin;
alter table public.document_uploads add column sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  add column content_type text not null default 'application/octet-stream';
alter table public.engagement_letters add column sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  add column content_type text not null default 'application/pdf';
alter table public.signatures add column signed_pdf_sha256 text check (signed_pdf_sha256 ~ '^[a-f0-9]{64}$'),
  add column signed_pdf_size_bytes bigint check (signed_pdf_size_bytes >= 0);
grant insert (id,requirement_id,client_id,bookkeeper_id,period_year,period_month,filename_original,storage_path,file_size_bytes,sha256,content_type)
  on public.document_uploads to bookdrop_app;
grant insert (id,bookkeeper_id,client_id,label,storage_path,filename,file_size_bytes,sha256,content_type)
  on public.engagement_letters to bookdrop_app;
commit;
