\set ON_ERROR_STOP on
-- Disposable local test fixtures only. Never run against a hosted destination.
insert into bookkeepers(id,email,account_type) values
 ('00000000-0000-4000-8000-000000000001','one@example.test','practitioner'),
 ('00000000-0000-4000-8000-000000000002','two@example.test','practitioner'),
 ('00000000-0000-4000-8000-000000000003','solo@example.test','solo');
insert into clients(id,bookkeeper_id,business_name,contact_email,portal_token) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','One','one@example.test','fixture-one'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Two','two@example.test','fixture-two'),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','Solo','solo@example.test','fixture-solo'),
 ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','Not self','extra@example.test','fixture-extra');
update bookkeepers set self_client_id='10000000-0000-4000-8000-000000000003' where account_type='solo';
insert into document_requirements(client_id,label) values
 ('10000000-0000-4000-8000-000000000001','One requirement'),
 ('10000000-0000-4000-8000-000000000002','Two requirement');

set role bookdrop_app;
do $$ begin
  if exists(select 1 from clients) or exists(select 1 from bookkeepers) then raise exception 'unauthenticated read'; end if;
end $$;
begin;
select set_config('bookdrop.bookkeeper_id','00000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from clients) <> 1 or (select count(*) from document_requirements) <> 1 then raise exception 'tenant isolation'; end if;
  begin
    update clients set bookkeeper_id='00000000-0000-4000-8000-000000000002';
    raise exception 'ownership reassignment accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into document_requirements(client_id,label) values ('10000000-0000-4000-8000-000000000002','cross-tenant');
    raise exception 'cross-tenant requirement accepted';
  exception when insufficient_privilege then null; end;
  begin
    update bookkeepers set plan='pro';
    raise exception 'plan escalation accepted';
  exception when insufficient_privilege then null; end;
  begin
    update bookkeepers set account_type='solo';
    raise exception 'account type escalation accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from app_private.identities;
    raise exception 'identity mapping exposed';
  exception when insufficient_privilege then null; end;
end $$;
update clients set business_name='Persisted local change';
commit;
-- Same physical database connection, after commit: no leaked tenant context.
do $$ begin if exists(select 1 from clients) then raise exception 'context leaked after commit'; end if; end $$;
begin;
select set_config('bookdrop.bookkeeper_id','00000000-0000-4000-8000-000000000002',true);
update clients set business_name='Must rollback';
rollback;
do $$ begin if exists(select 1 from clients) then raise exception 'context leaked after rollback'; end if; end $$;
begin;
select set_config('bookdrop.bookkeeper_id','00000000-0000-4000-8000-000000000003',true);
do $$ begin
  if (select count(*) from clients) <> 1 then raise exception 'solo accessed non-self client'; end if;
  begin
    insert into clients(bookkeeper_id,business_name,contact_email,portal_token) values
      ('00000000-0000-4000-8000-000000000003','Forbidden extra','extra@example.test','fixture-forbidden');
    raise exception 'solo created extra client';
  exception when insufficient_privilege then null; end;
end $$;
commit;
reset role;
do $$ begin
  if (select business_name from clients where portal_token='fixture-one') <> 'Persisted local change' then raise exception 'write lost'; end if;
  if (select business_name from clients where portal_token='fixture-two') <> 'Two' then raise exception 'rollback failed'; end if;
  begin
    update bookkeepers set self_client_id='10000000-0000-4000-8000-000000000002' where account_type='solo';
    set constraints all immediate;
    raise exception 'cross-tenant self client accepted';
  exception when foreign_key_violation then null; end;
end $$;
select 'PASS: persistence, rollback, tenant isolation, solo restriction, protected account fields, context reset';
