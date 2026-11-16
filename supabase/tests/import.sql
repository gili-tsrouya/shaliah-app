-- Import tests: a synthetic snapshot in the app's real backup format is converted into rows, twice,
-- and the numbers must match the phone's. Runs inside one transaction and rolls back.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;
\ir _helpers.sql

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'synthetic-a@example.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'synthetic-b@example.test');

insert into public.legacy_imports (id, user_id, snapshot) values ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', $json$
{
  "app": "shaliach", "version": 1, "createdAt": "2026-11-07T19:50:00.000Z",
  "data": {
    "settings": { "name": "בדיקה", "monthlyBudget": 2000, "reminderTime": "12:00", "googleClientId": "x.apps.googleusercontent.com",
                  "githubToken": "SHOULD-BE-STRIPPED", "dataRepoToken": "SHOULD-BE-STRIPPED", "pushEnabled": true },
    "googleToken": { "token": "SHOULD-BE-STRIPPED", "expires": 1 },
    "profile": { "age": 23, "home": { "name": "Fair Lawn, NJ", "lat": 40.9404, "lng": -74.1318 }, "savingGoal": 300,
                 "interests": ["יוגה", "ריצה"], "interestsExtra": "קרמיקה" },
    "agentSettings": { "home": "Brooklyn, NY", "lat": 40.6782, "lng": -73.9442, "rangeMiles": 10, "includeNyc": true, "maxPrice": 10,
                       "topics": ["food", "out"], "extra": "בלי ברים", "awayUntil": "2026-12-01", "updatedAt": "2026-11-01T10:00:00.000Z" },
    "partnerships": [ { "id": "p1", "name": "צופים צבר", "community": ["ישראלית"], "ageFrom": 10, "ageTo": 18, "notes": "שבט" } ],
    "calCategories": [
      { "id": "tzofim", "label": "צופים", "color": "blue", "googleCalendarId": "work@group.calendar.google.com" },
      { "id": "yj", "label": "Young Judaea", "color": "orange" },
      { "id": "personal", "label": "אישי", "color": "green", "googleCalendarId": "primary" },
      { "id": "k7x2", "label": "לימודים", "color": "purple" } ],
    "tasks": [
      { "id": "t1", "title": "להכין פעולה", "work": "tzofim", "status": "doing", "due": "2026-11-20", "note": "חנוכה" },
      { "id": "t2", "title": "לקנות ציוד", "work": "yj", "status": "todo" },
      { "id": "t3", "title": "משימה ישנה", "work": "deleted-category", "status": "done" } ],
    "events": [
      { "id": "e1", "title": "ישיבת צוות", "work": "tzofim", "kind": "event", "date": "2026-11-10", "start": "09:00", "end": "10:30",
        "googleId": "g-evt-1", "googleCalendarId": "work@group.calendar.google.com" },
      { "id": "e2", "title": "חופשה", "work": "personal", "kind": "vacation", "date": "2026-12-20", "endDate": "2026-12-27" },
      { "id": "e3", "title": "הגשה", "work": "k7x2", "kind": "deadline", "date": "2026-11-30" },
      { "id": "e4", "title": "בלי תאריך", "work": "personal", "kind": "event", "date": "" } ],
    "googleEvents": [ { "id": "g:abc", "title": "מגוגל", "work": "personal", "kind": "event", "date": "2026-11-11", "googleId": "abc", "googleCalendarId": "primary" } ],
    "categories": [ { "id": "food", "name": "אוכל וסופר", "plan": 600 }, { "id": "fun", "name": "יציאות", "plan": 250 } ],
    "expenses": [
      { "id": "x1", "amount": 23.4, "categoryId": "food", "note": "סופר", "date": "2026-10-28" },
      { "id": "x2", "amount": 12, "categoryId": "fun", "note": "סרט", "date": "2026-11-02" },
      { "id": "x3", "amount": 5.5, "categoryId": "food", "note": "החזר", "date": "2026-11-03", "refund": true },
      { "id": "x4", "amount": 8.25, "categoryId": "gone", "note": "קטגוריה שנמחקה", "date": "2026-11-04" } ],
    "owed": [ { "id": "o1", "who": "נועה", "what": "פיצה", "amount": 9, "categoryId": "food", "date": "2026-11-02" } ],
    "people": [
      { "id": "h1", "name": "סבתא", "everyDays": 7, "lastTalk": "2026-11-06", "phone": "+972501234567",
        "photo": "data:image/jpeg;base64,AAAA", "history": ["g", "y", "g"], "callDays": [5], "callTime": "10:00" },
      { "id": "h2", "name": "אמא ואבא", "everyDays": 3, "lastTalk": "2026-11-05" } ],
    "callEvents": { "h1": { "googleId": "g-call-1", "calendarId": "primary", "sig": "5|10:00" } },
    "savedDeals": ["deal-old-1", "deal-old-2"],
    "partnershipsUpdatedAt": "2026-11-01T10:00:00.000Z"
  }
}
$json$);

\set A '''aaaaaaaa-0000-4000-8000-000000000001'''

select test_helpers.must_equal($$ select (snapshot::text like '%SHOULD-BE-STRIPPED%')::text from public.legacy_imports $$, 'false',
  'tokens are stripped from a snapshot before it is stored');

-- ---------- first import, as the signed-in user ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select test_helpers.must_fail($$ select public.import_legacy_snapshot('11111111-0000-4000-8000-000000000001') $$,
  'another user cannot import someone else''s snapshot');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select test_helpers.must_fail($$ select public.import_legacy_snapshot_for('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'the internal import function cannot be called through the API');
select test_helpers.must_equal($$ select (public.import_legacy_snapshot('11111111-0000-4000-8000-000000000001') ->> 'mirror') $$, 'false',
  'the owner can import their own snapshot');
reset role;

create function test_helpers.report_matches() returns text language sql as $$
  select coalesce(string_agg(k, ', '), 'match')
  from public.legacy_imports i, lateral jsonb_object_keys(i.report -> 'account') k
  where i.id = '11111111-0000-4000-8000-000000000001' and k not in ('events', 'expenses', 'expenses_total', 'expenses_by_month')
    and (i.report -> 'account' -> k) is distinct from (i.report -> 'phone' -> k)
$$;
select test_helpers.must_equal('select test_helpers.report_matches()', 'match', 'the account''s numbers match the phone''s (tasks, people, categories, links, saved finds)');
select test_helpers.must_equal($$ select report -> 'skipped' ->> 'events_without_date' from public.legacy_imports $$, '1',
  'an event without a date is reported, not silently dropped');
select test_helpers.must_equal($$ select count(*)::text from public.events where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$, '3', '3 of 4 events imported');
select test_helpers.must_equal($$ select (report -> 'account' ->> 'expenses_total') || ' = ' || (report -> 'phone' ->> 'expenses_total') from public.legacy_imports $$,
  '49.15 = 49.15', 'the sum of expenses is identical to the cent');
select test_helpers.must_equal($$ select (report -> 'account' -> 'expenses_by_month' = report -> 'phone' -> 'expenses_by_month')::text from public.legacy_imports $$,
  'true', 'expenses per month are identical');

-- details that must survive
select test_helpers.must_equal($$ select c.legacy_id || '/' || t.status || '/' || t.due || '/' || t.note from public.tasks t join public.calendar_categories c on c.id = t.category_id where t.legacy_id = 't1' $$,
  'tzofim/doing/2026-11-20/חנוכה', 'a task keeps its category, status, due date and note');
select test_helpers.must_equal($$ select (category_id is null)::text from public.tasks where legacy_id = 't3' $$, 'true', 'a task of a deleted category is kept, without a category');
select test_helpers.must_equal($$ select start_time || '-' || end_time from public.events where legacy_id = 'e1' $$, '09:00:00-10:30:00', 'an event keeps its times');
select test_helpers.must_equal($$ select kind || ' ' || date || ' ' || end_date from public.events where legacy_id = 'e2' $$, 'vacation 2026-12-20 2026-12-27', 'a vacation keeps its span');
select test_helpers.must_equal($$ select c.label from public.events e join public.calendar_categories c on c.id = e.category_id where e.legacy_id = 'e3' $$, 'לימודים', 'a user-made category is kept and linked');
select test_helpers.must_equal($$ select string_agg(legacy_id, ',' order by legacy_id) from public.calendar_categories where is_youth $$, 'tzofim,yj', 'the two youth-work categories are marked as youth');
select test_helpers.must_equal($$ select l.external_calendar_id || '|' || l.external_event_id from public.event_external_links l join public.events e on e.id = l.event_id where e.legacy_id = 'e1' $$,
  'work@group.calendar.google.com|g-evt-1', 'an event keeps its Google link');
select test_helpers.must_equal($$ select l.external_event_id from public.event_external_links l join public.contacts c on c.id = l.contact_id where c.legacy_id = 'h1' $$,
  'g-call-1', 'a contact keeps their repeating Google call event');
select test_helpers.must_equal($$ select is_refund::text || ' ' || amount from public.expenses where legacy_id = 'x3' $$, 'true 5.50', 'a refund stays a refund');
select test_helpers.must_equal($$ select (category_id is null)::text || ' ' || amount from public.expenses where legacy_id = 'x4' $$, 'true 8.25', 'an expense of a deleted category is kept');
select test_helpers.must_equal($$ select phone || ' ' || call_days::text || ' ' || call_time || ' ' || every_days || ' ' || last_talk from public.contacts where legacy_id = 'h1' $$,
  '+972501234567 {5} 10:00:00 7 2026-11-06', 'a contact keeps phone, call days, time, rhythm and last talk');
select test_helpers.must_equal($$ select string_agg(grade, '' order by legacy_seq) from public.contact_touches $$, 'gyg', 'the history dots keep their order');
select test_helpers.must_equal($$ select display_name || ' ' || monthly_budget || ' ' || saving_goal || ' ' || age || ' ' || reminder_time from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  'בדיקה 2000.00 300.00 23 12:00:00', 'the profile keeps name, budget, saving goal, age and reminder time');
select test_helpers.must_equal($$ select city || ' ' || lat || ' ' || lng from public.shlichut_assignments $$, 'Fair Lawn, NJ 40.94 -74.13', 'the home town is kept, rounded to about 1 km');
select test_helpers.must_equal($$ select search_place || ' ' || range_miles || ' ' || include_nyc || ' ' || max_price || ' ' || topics::text || ' ' || interests::text || ' ' || interests_extra || ' ' || extra || ' ' || away_until from public.agent_preferences $$,
  'Brooklyn, NY 10 true 10 {food,out} {יוגה,ריצה} קרמיקה בלי ברים 2026-12-01', 'the agent settings and interests are kept');
select test_helpers.must_equal($$ select name || ' ' || community::text || ' ' || age_from || '-' || age_to || ' ' || notes from public.audiences $$,
  'צופים צבר {ישראלית} 10-18 שבט', 'a partnership is kept');
select test_helpers.must_equal($$ select who || ' ' || what || ' ' || amount from public.owed_items $$, 'נועה פיצה 9.00', 'an owed item is kept');

-- ---------- importing again changes nothing ----------
create temp table before_again as
  select (select count(*) from public.tasks) t, (select count(*) from public.events) e, (select count(*) from public.expenses) x,
         (select count(*) from public.contacts) c, (select count(*) from public.contact_touches) h, (select count(*) from public.event_external_links) l,
         (select count(*) from public.calendar_categories) cc, (select count(*) from public.user_item_state) s, (select count(*) from public.change_log) log;
select public.import_legacy_snapshot_for('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001');
select test_helpers.must_equal($$ select (b = row((select count(*) from public.tasks), (select count(*) from public.events), (select count(*) from public.expenses),
  (select count(*) from public.contacts), (select count(*) from public.contact_touches), (select count(*) from public.event_external_links),
  (select count(*) from public.calendar_categories), (select count(*) from public.user_item_state))::text)::text
  from (select row(t, e, x, c, h, l, cc, s)::text b from before_again) q $$, 'true', 'importing the same snapshot again creates no duplicates');

-- ---------- a newer snapshot: one title changed, one task and one expense removed on the phone ----------
insert into public.legacy_imports (id, user_id, snapshot)
select '11111111-0000-4000-8000-000000000002', user_id,
  jsonb_set(jsonb_set(jsonb_set(snapshot, '{data,tasks}', (snapshot #> '{data,tasks}') - 1),
    '{data,tasks,0,title}', '"להכין פעולה לחנוכה"'), '{data,expenses}', (snapshot #> '{data,expenses}') - 1)
from public.legacy_imports where id = '11111111-0000-4000-8000-000000000001';

select public.import_legacy_snapshot_for('11111111-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001');
select test_helpers.must_equal($$ select title from public.tasks where legacy_id = 't1' $$, 'להכין פעולה לחנוכה', 'a newer snapshot updates the row it already imported');
select test_helpers.must_equal($$ select count(*)::text from public.tasks where deleted_at is null $$, '3', 'a plain import never deletes anything');

select public.import_legacy_snapshot_for('11111111-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select test_helpers.must_equal($$ select string_agg(legacy_id, ',' order by legacy_id) from public.tasks where deleted_at is not null $$, 't2',
  'a mirror import marks what was deleted on the phone as deleted (kept, not erased)');
select test_helpers.must_equal($$ select (report -> 'account' ->> 'expenses_total') || ' = ' || (report -> 'phone' ->> 'expenses_total') from public.legacy_imports where id = '11111111-0000-4000-8000-000000000002' $$,
  '37.15 = 37.15', 'after a mirror import the expense totals match again');
select public.import_legacy_snapshot_for('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', true);
select test_helpers.must_equal($$ select count(*)::text from public.tasks where deleted_at is null $$, '3', 'a row that is back in the snapshot is restored');

-- ---------- after the switch, importing phone data is refused ----------
update public.profiles set data_source = 'account' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select test_helpers.must_fail($$ select public.import_legacy_snapshot_for('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001') $$,
  'once the account is the source of truth, a phone import is refused');

\o
\set QUIET off
\pset tuples_only on
select 'ok ' || n || ' - ' || label from test_helpers.results order by n;
select 'ALL ' || count(*) || ' IMPORT TESTS PASSED' from test_helpers.results;
rollback;
