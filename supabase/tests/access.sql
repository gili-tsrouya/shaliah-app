-- Access tests: two synthetic users must not be able to read, change or delete each other's rows or
-- photos, and the anonymous role must get nothing. Runs inside one transaction and rolls back, so it
-- leaves no trace in the project it runs against.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;

create schema test_helpers;
grant usage on schema test_helpers to anon, authenticated;
create table test_helpers.results (n serial, label text);
grant insert on test_helpers.results to anon, authenticated;
grant usage on sequence test_helpers.results_n_seq to anon, authenticated;

create function test_helpers.pass(label text) returns void language sql as
  $$ insert into test_helpers.results (label) values (label) $$;

-- the statement must fail (any error); it is undone either way
create function test_helpers.must_fail(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    perform test_helpers.pass(label || '  [' || sqlstate || ']');
    return;
  end;
  raise exception 'SHOULD HAVE FAILED: % (%)', label, stmt;
end $$;

-- the statement must run and touch exactly `want` rows
create function test_helpers.must_touch(stmt text, want bigint, label text) returns void language plpgsql as $$
declare got bigint;
begin
  execute stmt;
  get diagnostics got = row_count;
  if got <> want then raise exception 'WRONG ROW COUNT: % (% rows, wanted %): %', label, got, want, stmt; end if;
  perform test_helpers.pass(label);
end $$;

-- the query must return exactly `want` as its single value
create function test_helpers.must_equal(stmt text, want text, label text) returns void language plpgsql as $$
declare got text;
begin
  execute stmt into got;
  if got is distinct from want then raise exception 'WRONG VALUE: % (got %, wanted %): %', label, got, want, stmt; end if;
  perform test_helpers.pass(label);
end $$;

-- ---------- two synthetic users, seeded by the server role ----------

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'synthetic-a@example.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'synthetic-b@example.test');

\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''

insert into public.profiles (user_id, display_name) values (:A, 'Synthetic A'), (:B, 'Synthetic B');
insert into public.shlichut_assignments (user_id, city) values (:A, 'Testville');
insert into public.audiences (user_id, name) values (:A, 'Test audience');
insert into public.agent_preferences (user_id, search_place) values (:A, 'Testville');
insert into public.calendar_categories (id, user_id, legacy_id, label, is_youth) values
  ('a1000000-0000-4000-8000-000000000001', :A, 'personal', 'Personal', false),
  ('a1000000-0000-4000-8000-000000000002', :A, 'tzofim', 'Youth', true);
insert into public.tasks (id, user_id, title) values ('a2000000-0000-4000-8000-000000000001', :A, 'A task');
insert into public.contacts (id, user_id, name) values ('a3000000-0000-4000-8000-000000000001', :A, 'A contact');
insert into public.contact_touches (user_id, contact_id, grade) values (:A, 'a3000000-0000-4000-8000-000000000001', 'g');
insert into public.events (id, user_id, category_id, title, date) values
  ('a4000000-0000-4000-8000-000000000001', :A, 'a1000000-0000-4000-8000-000000000001', 'A personal event', '2026-12-01'),
  ('a4000000-0000-4000-8000-000000000002', :A, 'a1000000-0000-4000-8000-000000000002', 'A youth event', '2026-12-02');
insert into public.event_external_links (user_id, event_id, external_calendar_id, external_event_id)
  values (:A, 'a4000000-0000-4000-8000-000000000001', 'cal', 'ext-1');
insert into public.external_events (user_id, external_calendar_id, external_event_id, date) values (:A, 'cal', 'ext-2', '2026-12-03');
insert into public.sync_outbox (user_id, event_id, op) values (:A, 'a4000000-0000-4000-8000-000000000001', 'upsert');
insert into public.google_connections (user_id, refresh_token_ciphertext, scopes) values (:A, 'not-a-real-token', '{calendar.events}');
insert into public.google_oauth_states (state, user_id, code_verifier) values ('state-a', :A, 'verifier');
insert into public.budget_categories (id, user_id, name) values ('a5000000-0000-4000-8000-000000000001', :A, 'Food');
insert into public.expenses (user_id, category_id, amount, date) values (:A, 'a5000000-0000-4000-8000-000000000001', 12.50, '2026-11-01');
insert into public.owed_items (user_id, who, amount, date) values (:A, 'Someone', 5, '2026-11-01');
insert into public.discovery_items (id, feed, title, category) values ('item-1', 'deals', 'A public event', 'food');
insert into public.discovery_item_changes (item_id, field, old_value, new_value) values ('item-1', 'date', '2026-11-01', '2026-11-02');
insert into public.audience_ideas (item_id, audience_key, idea) values ('item-1', 'test', 'An idea');
insert into public.user_item_state (user_id, item_id, saved_at) values (:A, 'item-1', now());
insert into public.interaction_events (user_id, item_id, kind) values (:A, 'item-1', 'save');
insert into public.memories (id, user_id, date, kind, event_id) values
  ('a6000000-0000-4000-8000-000000000001', :A, '2026-12-01', 'personal', 'a4000000-0000-4000-8000-000000000001'),
  ('a6000000-0000-4000-8000-000000000002', :A, '2026-12-02', 'shlichut', null),
  ('a6000000-0000-4000-8000-000000000003', :A, '2026-12-02', 'personal', 'a4000000-0000-4000-8000-000000000002');
insert into public.photos (id, user_id, memory_id) values
  ('a7000000-0000-4000-8000-000000000001', :A, 'a6000000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000002', :A, 'a6000000-0000-4000-8000-000000000002'),
  ('a7000000-0000-4000-8000-000000000003', :A, 'a6000000-0000-4000-8000-000000000003');
insert into public.recap_edits (user_id, period_kind, period_start) values (:A, 'month', '2026-11-01');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (:A, 'https://push.example.test/a', 'k', 'a');
insert into public.legacy_imports (user_id, snapshot) values (:A, '{"app":"shaliach"}');
insert into public.job_runs (job, ok) values ('test', true);
insert into storage.objects (bucket_id, name) values
  ('media', 'aaaaaaaa-0000-4000-8000-000000000001/a6000000/a7000000/display.jpg');

-- ---------- structure: nothing is left open ----------

select test_helpers.must_equal(
  $$ select count(*)::text from pg_tables t join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
     where t.schemaname = 'public' and not c.relrowsecurity $$, '0', 'every table in public has row-level security on');
select test_helpers.must_equal(
  $$ select count(*)::text from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' $$,
  '0', 'the anonymous role has no privilege on any table');
select test_helpers.must_equal(
  $$ select count(*)::text from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated'
     and table_name in ('google_connections', 'google_oauth_states', 'sync_outbox', 'job_runs') $$,
  '0', 'signed-in users have no privilege on server-only tables');
select test_helpers.must_equal(
  $$ select count(*)::text from information_schema.routine_privileges where routine_schema = 'public'
     and grantee in ('anon', 'PUBLIC') $$, '0', 'no function in public is callable anonymously');
select test_helpers.must_equal($$ select public::text from storage.buckets where id = 'media' $$, 'false', 'the photo bucket is private');

-- ---------- photo flags (as the server role, before switching) ----------

select test_helpers.must_equal($$ select may_show_minors::text from public.photos where id = 'a7000000-0000-4000-8000-000000000001' $$,
  'false', 'a photo in a personal memory is not flagged');
select test_helpers.must_equal($$ select may_show_minors::text from public.photos where id = 'a7000000-0000-4000-8000-000000000002' $$,
  'true', 'a photo in a shlichut memory is flagged automatically');
select test_helpers.must_equal($$ select may_show_minors::text from public.photos where id = 'a7000000-0000-4000-8000-000000000003' $$,
  'true', 'a photo on a youth-category event is flagged automatically');
select test_helpers.must_fail($$ update public.photos set may_show_minors = false where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  'the minors flag cannot be cleared in bulk');
select test_helpers.must_touch($$ update public.photos set may_show_minors = false where id = 'a7000000-0000-4000-8000-000000000002' $$,
  1, 'the minors flag can be cleared on one photo');
select test_helpers.must_equal($$ select (minors_cleared_at is not null)::text from public.photos where id = 'a7000000-0000-4000-8000-000000000002' $$,
  'true', 'clearing the flag is recorded with a time');

-- ---------- user B against user A's data ----------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
declare
  t text;
begin
  -- B sees none of A's rows, and cannot change or delete them
  foreach t in array array[
    'shlichut_assignments', 'audiences', 'agent_preferences', 'calendar_categories', 'tasks', 'contacts',
    'contact_touches', 'events', 'budget_categories', 'expenses', 'owed_items', 'user_item_state', 'memories',
    'photos', 'recap_edits', 'push_subscriptions', 'event_external_links', 'external_events', 'change_log',
    'legacy_imports', 'interaction_events'
  ] loop
    perform test_helpers.must_equal(
      format('select count(*)::text from public.%I where user_id <> %L', t, 'bbbbbbbb-0000-4000-8000-000000000002'),
      '0', format('B reads no rows of A in %s', t));
  end loop;
  perform test_helpers.must_equal('select count(*)::text from public.profiles', '1', 'B reads only their own profile');

  foreach t in array array[
    'shlichut_assignments', 'audiences', 'agent_preferences', 'calendar_categories', 'tasks', 'contacts',
    'contact_touches', 'events', 'budget_categories', 'expenses', 'owed_items', 'user_item_state', 'memories',
    'photos', 'recap_edits', 'push_subscriptions'
  ] loop
    perform test_helpers.must_touch(
      format('update public.%I set user_id = user_id where user_id = %L', t, 'aaaaaaaa-0000-4000-8000-000000000001'),
      0, format('B cannot change A''s rows in %s', t));
    perform test_helpers.must_touch(
      format('delete from public.%I where user_id = %L', t, 'aaaaaaaa-0000-4000-8000-000000000001'),
      0, format('B cannot delete A''s rows in %s', t));
  end loop;
end $$;

-- B cannot write rows that belong to A, or take over A's rows
select test_helpers.must_fail($$ insert into public.tasks (user_id, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'planted') $$,
  'B cannot add a task in A''s name');
select test_helpers.must_fail($$ insert into public.expenses (user_id, amount, date) values ('aaaaaaaa-0000-4000-8000-000000000001', 1, '2026-11-01') $$,
  'B cannot add an expense in A''s name');
select test_helpers.must_fail($$ insert into public.memories (user_id, date) values ('aaaaaaaa-0000-4000-8000-000000000001', '2026-11-01') $$,
  'B cannot add a memory in A''s name');
select test_helpers.must_fail($$ insert into public.photos (user_id, memory_id) values ('aaaaaaaa-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001') $$,
  'B cannot add a photo in A''s name');
select test_helpers.must_fail($$ insert into public.profiles (user_id) values ('aaaaaaaa-0000-4000-8000-000000000001') $$,
  'B cannot write A''s profile');
select test_helpers.must_fail($$ insert into public.legacy_imports (user_id, snapshot) values ('aaaaaaaa-0000-4000-8000-000000000001', '{}') $$,
  'B cannot add a snapshot in A''s name');
select test_helpers.must_fail($$ insert into public.interaction_events (user_id, kind) values ('aaaaaaaa-0000-4000-8000-000000000001', 'save') $$,
  'B cannot add signals in A''s name');

-- B's own rows cannot point at A's rows
select test_helpers.must_fail($$ insert into public.expenses (user_id, category_id, amount, date)
  values ('bbbbbbbb-0000-4000-8000-000000000002', 'a5000000-0000-4000-8000-000000000001', 1, '2026-11-01') $$,
  'B''s expense cannot use A''s budget category');
select test_helpers.must_fail($$ insert into public.events (user_id, category_id, title, date)
  values ('bbbbbbbb-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'x', '2026-11-01') $$,
  'B''s event cannot use A''s calendar category');
select test_helpers.must_fail($$ insert into public.memories (user_id, date, event_id)
  values ('bbbbbbbb-0000-4000-8000-000000000002', '2026-11-01', 'a4000000-0000-4000-8000-000000000001') $$,
  'B''s memory cannot attach to A''s event');
select test_helpers.must_fail($$ insert into public.photos (user_id, memory_id)
  values ('bbbbbbbb-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000001') $$,
  'B''s photo cannot attach to A''s memory');

-- B can work with their own rows
select test_helpers.must_touch($$ insert into public.tasks (user_id, title) values ('bbbbbbbb-0000-4000-8000-000000000002', 'mine') $$,
  1, 'B can add their own task');
select test_helpers.must_fail($$ update public.tasks set user_id = 'aaaaaaaa-0000-4000-8000-000000000001' where title = 'mine' $$,
  'B cannot hand a row over to A');

-- server-only tables and tokens
select test_helpers.must_fail('select 1 from public.google_connections', 'a signed-in user cannot read Google tokens');
select test_helpers.must_fail('select 1 from public.google_oauth_states', 'a signed-in user cannot read connect-flow states');
select test_helpers.must_fail('select 1 from public.sync_outbox', 'a signed-in user cannot read the sync queue');
select test_helpers.must_fail('select 1 from public.job_runs', 'a signed-in user cannot read job runs');
select test_helpers.must_equal('select count(*)::text from public.google_connection_status()', '0', 'B gets no status for A''s Google connection');

-- read-only and append-only tables
select test_helpers.must_fail($$ insert into public.change_log (user_id, table_name, row_id, op) values ('bbbbbbbb-0000-4000-8000-000000000002', 't', 'r', 'INSERT') $$,
  'the change log cannot be written by a user');
select test_helpers.must_fail($$ insert into public.event_external_links (user_id, event_id, external_calendar_id, external_event_id)
  values ('bbbbbbbb-0000-4000-8000-000000000002', null, 'c', 'e') $$, 'Google links cannot be written by a user');
select test_helpers.must_equal('select count(*)::text from public.discovery_items', '1', 'a signed-in user can read the shared catalog');
select test_helpers.must_fail($$ insert into public.discovery_items (id, feed, title, category) values ('planted', 'deals', 'x', 'y') $$,
  'a user cannot add to the shared catalog');
select test_helpers.must_fail($$ update public.discovery_items set title = 'changed' $$, 'a user cannot change the shared catalog');

-- photos in storage
select test_helpers.must_equal('select count(*)::text from storage.objects where bucket_id = ''media''', '0', 'B sees none of A''s photo files');
select test_helpers.must_fail($$ insert into storage.objects (bucket_id, name) values ('media', 'aaaaaaaa-0000-4000-8000-000000000001/x/y/display.jpg') $$,
  'B cannot put a file in A''s folder');
select test_helpers.must_fail($$ insert into storage.objects (bucket_id, name) values ('media', 'loose-file.jpg') $$,
  'a file outside a user folder is refused');
select test_helpers.must_touch($$ update storage.objects set name = 'bbbbbbbb-0000-4000-8000-000000000002/stolen.jpg'
  where name like 'aaaaaaaa-%' $$, 0, 'B cannot move A''s photo file');
-- (Supabase refuses SQL deletes on storage tables for everyone; deleting through the Storage API is
--  covered by the API-level tests.)
select test_helpers.must_touch($$ insert into storage.objects (bucket_id, name) values ('media', 'bbbbbbbb-0000-4000-8000-000000000002/m/p/display.jpg') $$,
  1, 'B can put a file in their own folder');

-- ---------- user A sees their own data, and its limits ----------

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select test_helpers.must_equal('select count(*)::text from public.events', '2', 'A reads their own events');
select test_helpers.must_equal('select count(*)::text from storage.objects where bucket_id = ''media''', '1', 'A sees only their own photo file');
select test_helpers.must_equal('select status from public.google_connection_status()', 'connected', 'A sees their connection state, not the token');
select test_helpers.must_equal('select count(*)::text from public.tasks where title = ''mine''', '0', 'A reads none of B''s rows');
select test_helpers.must_fail($$ update public.legacy_imports set snapshot = '{}' $$, 'a saved snapshot cannot be rewritten');
select test_helpers.must_fail($$ delete from public.legacy_imports $$, 'a saved snapshot cannot be removed');
select test_helpers.must_fail($$ delete from public.change_log $$, 'the change log cannot be erased by a user');
select test_helpers.must_equal($$ select (count(*) > 0)::text from public.change_log where table_name = 'expenses' $$, 'true',
  'A''s changes are recorded in the change log');

-- deleting an event keeps the memory of it
select test_helpers.must_touch($$ delete from public.events where id = 'a4000000-0000-4000-8000-000000000001' $$, 1, 'A can delete their own event');
select test_helpers.must_equal($$ select (event_id is null)::text from public.memories where id = 'a6000000-0000-4000-8000-000000000001' $$,
  'true', 'the memory survives the event and is only unlinked');

-- ---------- the anonymous role gets nothing ----------

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    perform test_helpers.must_fail(format('select 1 from public.%I', t), format('anonymous cannot read %s', t));
  end loop;
end $$;
select test_helpers.must_fail('select * from public.google_connection_status()', 'anonymous cannot call the status function');
select test_helpers.must_equal('select count(*)::text from storage.objects where bucket_id = ''media''', '0', 'anonymous sees no photo files');

reset role;
\o
\set QUIET off
\pset tuples_only on
select 'ok ' || n || ' - ' || label from test_helpers.results order by n;
select 'ALL ' || count(*) || ' ACCESS TESTS PASSED' from test_helpers.results;
rollback;
