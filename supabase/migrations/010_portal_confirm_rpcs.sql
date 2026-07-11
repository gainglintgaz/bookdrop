-- 010_portal_confirm_rpcs.sql
-- Phase 2: magic-link portal can list/confirm lines without client Auth.
-- SECURITY DEFINER validates portal_token; stores fingerprint never raw token.
-- Advisors: get_advisors after apply.

create extension if not exists pgcrypto;

-- ─── List open lines for an upload (token-gated) ─────────────────────────────

create or replace function portal_list_confirm_lines(
  p_token text,
  p_upload_id uuid
)
returns setof document_line_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_policy text;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    raise exception 'invalid_token';
  end if;

  select c.id, c.confirm_policy into v_client_id, v_policy
  from clients c
  where c.portal_token = p_token and c.is_active = true;

  if v_client_id is null then
    raise exception 'invalid_token';
  end if;

  if v_policy = 'off' then
    return;
  end if;

  return query
  select li.*
  from document_line_items li
  join document_uploads u on u.id = li.upload_id
  where li.upload_id = p_upload_id
    and li.client_id = v_client_id
    and u.client_id = v_client_id
    and li.confirmed_at is null
    and (
      v_policy = 'all_lines'
      or (v_policy = 'low_confidence' and li.confidence = 'low')
    )
  order by li.line_index;
end;
$$;

revoke all on function portal_list_confirm_lines(text, uuid) from public;
grant execute on function portal_list_confirm_lines(text, uuid) to anon, authenticated;

-- ─── Confirm / change a line ─────────────────────────────────────────────────

create or replace function portal_confirm_line(
  p_token text,
  p_line_id uuid,
  p_action text,          -- accept | change
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client clients%rowtype;
  v_line document_line_items%rowtype;
  v_fp text;
  v_before text;
  v_after text;
  v_event text;
  v_open int;
begin
  if p_token is null or length(trim(p_token)) < 8 then
    raise exception 'invalid_token';
  end if;
  if p_action not in ('accept', 'change') then
    raise exception 'invalid_action';
  end if;

  select * into v_client
  from clients
  where portal_token = p_token and is_active = true;

  if v_client.id is null then
    raise exception 'invalid_token';
  end if;

  if v_client.confirm_policy = 'off' then
    raise exception 'confirm_disabled';
  end if;

  select * into v_line
  from document_line_items
  where id = p_line_id and client_id = v_client.id;

  if v_line.id is null then
    raise exception 'line_not_found';
  end if;

  if v_line.confirmed_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'line_id', v_line.id);
  end if;

  v_before := coalesce(v_line.final_category, v_line.suggested_category);
  if p_action = 'accept' then
    v_after := coalesce(v_line.suggested_category, 'Uncategorized');
    v_event := 'accept';
  else
    if p_category is null or length(trim(p_category)) = 0 then
      raise exception 'category_required';
    end if;
    v_after := trim(p_category);
    v_event := 'change';
  end if;

  -- Fingerprint token (sha256 hex) — never store raw token
  v_fp := encode(digest(p_token, 'sha256'), 'hex');

  update document_line_items
  set
    final_category = v_after,
    confirmed_by = 'client_portal',
    confirmed_at = now()
  where id = v_line.id;

  insert into portal_line_events (
    line_id, upload_id, client_id, bookkeeper_id,
    event_type, before_category, after_category,
    portal_token_fingerprint, meta
  ) values (
    v_line.id, v_line.upload_id, v_line.client_id, v_line.bookkeeper_id,
    v_event, v_before, v_after, v_fp,
    jsonb_build_object('line_index', v_line.line_index)
  );

  if v_event = 'change' and v_before is distinct from v_after then
    insert into categorization_corrections (
      bookkeeper_id, client_id, upload_id, line_id, actor,
      portal_token_fingerprint,
      transaction_date, transaction_amount_cents,
      vendor_normalized, description_raw,
      original_category, corrected_category,
      original_confidence, status, reason
    ) values (
      v_line.bookkeeper_id, v_line.client_id, v_line.upload_id, v_line.id, 'client_portal',
      v_fp,
      v_line.txn_date, v_line.amount_cents,
      v_line.matched_vendor, v_line.description_raw,
      v_before, v_after,
      v_line.confidence, 'applied', 'portal_confirm_change'
    );
  end if;

  -- If no open lines remain for this upload under policy, stamp client_confirmed_at
  select count(*) into v_open
  from document_line_items li
  where li.upload_id = v_line.upload_id
    and li.confirmed_at is null
    and (
      v_client.confirm_policy = 'all_lines'
      or (v_client.confirm_policy = 'low_confidence' and li.confidence = 'low')
    );

  if v_open = 0 then
    update document_uploads
    set client_confirmed_at = now()
    where id = v_line.upload_id
      and client_confirmed_at is null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'line_id', v_line.id,
    'after_category', v_after,
    'upload_fully_confirmed', v_open = 0,
    'open_remaining', v_open,
    'confirmed_at', now(),
    'token_fingerprint_prefix', left(v_fp, 12)
  );
end;
$$;

revoke all on function portal_confirm_line(text, uuid, text, text) from public;
grant execute on function portal_confirm_line(text, uuid, text, text) to anon, authenticated;
