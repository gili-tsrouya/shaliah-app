-- Found in the first real use: when a device with fewer saved finds was copied to the account, the
-- finds it no longer had stayed saved there, so the comparison showed a difference. A mirror copy now
-- un-saves them too. The rest of the function is unchanged.
create or replace function public.import_legacy_snapshot_for(p_import_id uuid, p_user uuid, p_mirror boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb;
  s jsonb;
  prof jsonb;
  agent jsonb;
  cats jsonb;
  v_report jsonb;
  skipped jsonb := '{}';
  n integer;
begin
  select i.snapshot -> 'data' into d from public.legacy_imports i where i.id = p_import_id and i.user_id = p_user;
  if d is null or jsonb_typeof(d) <> 'object' then
    raise exception 'snapshot not found for this user, or not a backup of the app';
  end if;
  if exists (select 1 from public.profiles p where p.user_id = p_user and p.data_source = 'account') then
    raise exception 'this account is already the source of truth; importing phone data again is refused';
  end if;

  s := coalesce(d -> 'settings', '{}');
  prof := coalesce(d -> 'profile', '{}');
  agent := coalesce(d -> 'agentSettings', '{}');

  -- profile
  insert into public.profiles as p (user_id, display_name, monthly_budget, reminder_time, saving_goal, age)
  values (p_user, coalesce(s ->> 'name', ''), (s ->> 'monthlyBudget')::numeric, public.try_time(s ->> 'reminderTime'),
          (prof ->> 'savingGoal')::numeric, coalesce(prof ->> 'age', agent ->> 'age')::smallint)
  on conflict (user_id) do update set display_name = excluded.display_name, monthly_budget = excluded.monthly_budget,
    reminder_time = excluded.reminder_time, saving_goal = excluded.saving_goal, age = excluded.age;

  -- where the shlichut is: the home place from the profile (rounded to about 1 km)
  if coalesce(prof -> 'home' ->> 'name', agent -> 'homeBase' ->> 'name', agent ->> 'home') is not null
     and not exists (select 1 from public.shlichut_assignments a where a.user_id = p_user) then
    insert into public.shlichut_assignments (user_id, city, lat, lng)
    values (p_user,
      coalesce(prof -> 'home' ->> 'name', agent -> 'homeBase' ->> 'name', agent ->> 'home'),
      round(coalesce(prof -> 'home' ->> 'lat', agent -> 'homeBase' ->> 'lat', agent ->> 'lat')::numeric, 2),
      round(coalesce(prof -> 'home' ->> 'lng', agent -> 'homeBase' ->> 'lng', agent ->> 'lng')::numeric, 2));
  end if;

  -- what the agents search by
  insert into public.agent_preferences as a (user_id, search_place, lat, lng, range_miles, include_nyc, max_price, topics,
    interests, interests_extra, extra, away_until)
  values (p_user, agent ->> 'home', round((agent ->> 'lat')::numeric, 2), round((agent ->> 'lng')::numeric, 2),
    (agent ->> 'rangeMiles')::smallint, coalesce((agent ->> 'includeNyc')::boolean, false), (agent ->> 'maxPrice')::smallint,
    coalesce((select array_agg(x) from jsonb_array_elements_text(agent -> 'topics') x), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(prof -> 'interests', agent -> 'interests')) x), '{}'),
    nullif(prof ->> 'interestsExtra', ''), nullif(agent ->> 'extra', ''), public.try_date(agent ->> 'awayUntil'))
  on conflict (user_id) do update set search_place = excluded.search_place, lat = excluded.lat, lng = excluded.lng,
    range_miles = excluded.range_miles, include_nyc = excluded.include_nyc, max_price = excluded.max_price,
    topics = excluded.topics, interests = excluded.interests, interests_extra = excluded.interests_extra,
    extra = excluded.extra, away_until = excluded.away_until;

  -- partnerships
  insert into public.audiences as a (user_id, legacy_id, name, community, age_from, age_to, notes)
  select p_user, x ->> 'id', coalesce(x ->> 'name', ''),
    coalesce((select array_agg(c) from jsonb_array_elements_text(x -> 'community') c), '{}'),
    (x ->> 'ageFrom')::smallint, (x ->> 'ageTo')::smallint, nullif(x ->> 'notes', '')
  from jsonb_array_elements(coalesce(d -> 'partnerships', '[]')) x where x ->> 'id' is not null
  on conflict (user_id, legacy_id) do update set name = excluded.name, community = excluded.community,
    age_from = excluded.age_from, age_to = excluded.age_to, notes = excluded.notes;

  -- calendar categories (the three built-in ones when the phone never saved its own list)
  cats := coalesce(d -> 'calCategories',
    '[{"id":"tzofim","label":"צופים","color":"blue"},{"id":"yj","label":"Young Judaea","color":"orange"},{"id":"personal","label":"אישי","color":"green"}]');
  insert into public.calendar_categories as c (user_id, legacy_id, label, color, google_calendar_id, sort, is_youth)
  select p_user, x ->> 'id', coalesce(x ->> 'label', x ->> 'id'), coalesce(x ->> 'color', 'gray'),
    nullif(x ->> 'googleCalendarId', ''), (ord - 1)::smallint, (x ->> 'id') in ('tzofim', 'yj')
  from jsonb_array_elements(cats) with ordinality as t(x, ord) where x ->> 'id' is not null
  on conflict (user_id, legacy_id) do update set label = excluded.label, color = excluded.color,
    google_calendar_id = excluded.google_calendar_id, sort = excluded.sort;

  -- tasks
  insert into public.tasks as t (user_id, legacy_id, category_id, title, status, due, note)
  select p_user, x ->> 'id',
    (select c.id from public.calendar_categories c where c.user_id = p_user and c.legacy_id = x ->> 'work'),
    coalesce(x ->> 'title', ''),
    case when x ->> 'status' in ('todo', 'doing', 'blocked', 'done') then x ->> 'status' else 'todo' end,
    public.try_date(x ->> 'due'), nullif(x ->> 'note', '')
  from jsonb_array_elements(coalesce(d -> 'tasks', '[]')) x where x ->> 'id' is not null
  on conflict (user_id, legacy_id) do update set category_id = excluded.category_id, title = excluded.title,
    status = excluded.status, due = excluded.due, note = excluded.note;

  -- people
  insert into public.contacts as c (user_id, legacy_id, name, every_days, last_talk, phone, call_days, call_time)
  select p_user, x ->> 'id', coalesce(x ->> 'name', ''), greatest(coalesce((x ->> 'everyDays')::smallint, 7), 1),
    public.try_date(x ->> 'lastTalk'), nullif(x ->> 'phone', ''),
    (select array_agg(v::smallint) from jsonb_array_elements_text(x -> 'callDays') v), public.try_time(x ->> 'callTime')
  from jsonb_array_elements(coalesce(d -> 'people', '[]')) x where x ->> 'id' is not null
  on conflict (user_id, legacy_id) do update set name = excluded.name, every_days = excluded.every_days,
    last_talk = excluded.last_talk, phone = excluded.phone, call_days = excluded.call_days, call_time = excluded.call_time;

  -- the last-8 history dots, oldest first
  insert into public.contact_touches as t (user_id, contact_id, grade, legacy_seq)
  select p_user, c.id, g, ord::smallint
  from jsonb_array_elements(coalesce(d -> 'people', '[]')) x
  join public.contacts c on c.user_id = p_user and c.legacy_id = x ->> 'id'
  cross join lateral jsonb_array_elements_text(coalesce(x -> 'history', '[]')) with ordinality as h(g, ord)
  where g in ('g', 'y', 'r')
  on conflict (contact_id, legacy_seq) do update set grade = excluded.grade;
  delete from public.contact_touches t using public.contacts c
  where t.contact_id = c.id and c.user_id = p_user and t.legacy_seq is not null
    and t.legacy_seq > coalesce((select jsonb_array_length(x -> 'history')
        from jsonb_array_elements(coalesce(d -> 'people', '[]')) x where x ->> 'id' = c.legacy_id limit 1), 0);

  -- events; one without a readable date cannot be placed on a calendar and is reported instead
  select count(*) into n from jsonb_array_elements(coalesce(d -> 'events', '[]')) x
    where x ->> 'id' is not null and public.try_date(x ->> 'date') is null;
  if n > 0 then skipped := skipped || jsonb_build_object('events_without_date', n); end if;

  insert into public.events as e (user_id, legacy_id, category_id, title, kind, date, end_date, start_time, end_time)
  select p_user, x ->> 'id',
    (select c.id from public.calendar_categories c where c.user_id = p_user and c.legacy_id = x ->> 'work'),
    coalesce(x ->> 'title', ''),
    case when x ->> 'kind' in ('event', 'deadline', 'vacation') then x ->> 'kind' else 'event' end,
    public.try_date(x ->> 'date'),
    case when public.try_date(x ->> 'endDate') >= public.try_date(x ->> 'date') then public.try_date(x ->> 'endDate') end,
    public.try_time(x ->> 'start'), public.try_time(x ->> 'end')
  from jsonb_array_elements(coalesce(d -> 'events', '[]')) x
  where x ->> 'id' is not null and public.try_date(x ->> 'date') is not null
  on conflict (user_id, legacy_id) do update set category_id = excluded.category_id, title = excluded.title,
    kind = excluded.kind, date = excluded.date, end_date = excluded.end_date, start_time = excluded.start_time,
    end_time = excluded.end_time;

  -- existing Google links: the server takes over the same Google events, so nothing is created twice
  insert into public.event_external_links as l (user_id, event_id, external_calendar_id, external_event_id)
  select p_user, e.id, x ->> 'googleCalendarId', x ->> 'googleId'
  from jsonb_array_elements(coalesce(d -> 'events', '[]')) x
  join public.events e on e.user_id = p_user and e.legacy_id = x ->> 'id'
  where nullif(x ->> 'googleId', '') is not null and nullif(x ->> 'googleCalendarId', '') is not null
  on conflict do nothing;

  insert into public.event_external_links as l (user_id, contact_id, external_calendar_id, external_event_id)
  select p_user, c.id, v ->> 'calendarId', v ->> 'googleId'
  from jsonb_each(coalesce(d -> 'callEvents', '{}')) as ce(k, v)
  join public.contacts c on c.user_id = p_user and c.legacy_id = ce.k
  where nullif(v ->> 'googleId', '') is not null and nullif(v ->> 'calendarId', '') is not null
  on conflict do nothing;

  -- budget
  insert into public.budget_categories as b (user_id, legacy_id, name, plan, sort)
  select p_user, x ->> 'id', coalesce(x ->> 'name', ''), coalesce((x ->> 'plan')::numeric, 0), (ord - 1)::smallint
  from jsonb_array_elements(coalesce(d -> 'categories', '[]')) with ordinality as t(x, ord) where x ->> 'id' is not null
  on conflict (user_id, legacy_id) do update set name = excluded.name, plan = excluded.plan, sort = excluded.sort;

  select count(*) into n from jsonb_array_elements(coalesce(d -> 'expenses', '[]')) x
    where x ->> 'id' is not null and public.try_date(x ->> 'date') is null;
  if n > 0 then skipped := skipped || jsonb_build_object('expenses_without_date', n); end if;

  insert into public.expenses as e (user_id, legacy_id, category_id, amount, note, date, is_refund)
  select p_user, x ->> 'id',
    (select b.id from public.budget_categories b where b.user_id = p_user and b.legacy_id = x ->> 'categoryId'),
    (x ->> 'amount')::numeric, coalesce(x ->> 'note', ''), public.try_date(x ->> 'date'), coalesce((x ->> 'refund')::boolean, false)
  from jsonb_array_elements(coalesce(d -> 'expenses', '[]')) x
  where x ->> 'id' is not null and public.try_date(x ->> 'date') is not null
  on conflict (user_id, legacy_id) do update set category_id = excluded.category_id, amount = excluded.amount,
    note = excluded.note, date = excluded.date, is_refund = excluded.is_refund;

  insert into public.owed_items as o (user_id, legacy_id, category_id, who, what, amount, date)
  select p_user, x ->> 'id',
    (select b.id from public.budget_categories b where b.user_id = p_user and b.legacy_id = x ->> 'categoryId'),
    coalesce(x ->> 'who', ''), coalesce(x ->> 'what', ''), (x ->> 'amount')::numeric,
    coalesce(public.try_date(x ->> 'date'), current_date)
  from jsonb_array_elements(coalesce(d -> 'owed', '[]')) x where x ->> 'id' is not null
  on conflict (user_id, legacy_id) do update set category_id = excluded.category_id, who = excluded.who,
    what = excluded.what, amount = excluded.amount, date = excluded.date;

  -- saved finds
  insert into public.user_item_state as u (user_id, item_id, saved_at)
  select p_user, x, now() from jsonb_array_elements_text(coalesce(d -> 'savedDeals', '[]')) x
  on conflict (user_id, item_id) do update set saved_at = coalesce(u.saved_at, excluded.saved_at);

  -- mirror: rows that came from the phone and are no longer in the snapshot were deleted there
  if p_mirror then
    -- a find that is no longer saved on the device is no longer saved in the account
    update public.user_item_state u set saved_at = null
    where u.user_id = p_user and u.saved_at is not null
      and not exists (select 1 from jsonb_array_elements_text(coalesce(d -> 'savedDeals', '[]')) x where x = u.item_id);
    update public.tasks t set deleted_at = now() where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null
      and not exists (select 1 from jsonb_array_elements(coalesce(d -> 'tasks', '[]')) x where x ->> 'id' = t.legacy_id);
    update public.events t set deleted_at = now() where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null
      and not exists (select 1 from jsonb_array_elements(coalesce(d -> 'events', '[]')) x where x ->> 'id' = t.legacy_id);
    update public.expenses t set deleted_at = now() where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null
      and not exists (select 1 from jsonb_array_elements(coalesce(d -> 'expenses', '[]')) x where x ->> 'id' = t.legacy_id);
    update public.owed_items t set deleted_at = now() where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null
      and not exists (select 1 from jsonb_array_elements(coalesce(d -> 'owed', '[]')) x where x ->> 'id' = t.legacy_id);
    update public.contacts t set deleted_at = now() where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null
      and not exists (select 1 from jsonb_array_elements(coalesce(d -> 'people', '[]')) x where x ->> 'id' = t.legacy_id);
    update public.audiences t set deleted_at = now() where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null
      and not exists (select 1 from jsonb_array_elements(coalesce(d -> 'partnerships', '[]')) x where x ->> 'id' = t.legacy_id);
    update public.budget_categories t set deleted_at = now() where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null
      and not exists (select 1 from jsonb_array_elements(coalesce(d -> 'categories', '[]')) x where x ->> 'id' = t.legacy_id);
    update public.calendar_categories t set deleted_at = now() where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null
      and not exists (select 1 from jsonb_array_elements(cats) x where x ->> 'id' = t.legacy_id);
    -- and a row that is back in the snapshot is restored
    update public.tasks t set deleted_at = null where t.user_id = p_user and t.deleted_at is not null
      and exists (select 1 from jsonb_array_elements(coalesce(d -> 'tasks', '[]')) x where x ->> 'id' = t.legacy_id);
    update public.events t set deleted_at = null where t.user_id = p_user and t.deleted_at is not null
      and exists (select 1 from jsonb_array_elements(coalesce(d -> 'events', '[]')) x where x ->> 'id' = t.legacy_id);
    update public.expenses t set deleted_at = null where t.user_id = p_user and t.deleted_at is not null
      and exists (select 1 from jsonb_array_elements(coalesce(d -> 'expenses', '[]')) x where x ->> 'id' = t.legacy_id);
  end if;

  -- side-by-side numbers for the comparison screen: what the phone had, and what the account now holds
  v_report := jsonb_build_object(
    'phone', jsonb_build_object(
      'tasks', jsonb_array_length(coalesce(d -> 'tasks', '[]')),
      'tasks_by_status', (select coalesce(jsonb_object_agg(k, c), '{}') from (select x ->> 'status' k, count(*) c
          from jsonb_array_elements(coalesce(d -> 'tasks', '[]')) x group by 1) q),
      'events', jsonb_array_length(coalesce(d -> 'events', '[]')),
      'expenses', jsonb_array_length(coalesce(d -> 'expenses', '[]')),
      'expenses_total', (select coalesce(sum((x ->> 'amount')::numeric), 0) from jsonb_array_elements(coalesce(d -> 'expenses', '[]')) x),
      'expenses_by_month', (select coalesce(jsonb_object_agg(k, c), '{}') from (select left(x ->> 'date', 7) k, sum((x ->> 'amount')::numeric) c
          from jsonb_array_elements(coalesce(d -> 'expenses', '[]')) x group by 1) q),
      'owed', jsonb_array_length(coalesce(d -> 'owed', '[]')),
      'people', jsonb_array_length(coalesce(d -> 'people', '[]')),
      'people_with_photo', (select count(*) from jsonb_array_elements(coalesce(d -> 'people', '[]')) x where nullif(x ->> 'photo', '') is not null),
      'budget_categories', jsonb_array_length(coalesce(d -> 'categories', '[]')),
      'calendar_categories', jsonb_array_length(cats),
      'partnerships', jsonb_array_length(coalesce(d -> 'partnerships', '[]')),
      'saved_finds', jsonb_array_length(coalesce(d -> 'savedDeals', '[]')),
      'google_linked_events', (select count(*) from jsonb_array_elements(coalesce(d -> 'events', '[]')) x where nullif(x ->> 'googleId', '') is not null),
      'google_call_events', (select count(*) from jsonb_each(coalesce(d -> 'callEvents', '{}')))
    ),
    'account', jsonb_build_object(
      'tasks', (select count(*) from public.tasks t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null),
      'tasks_by_status', (select coalesce(jsonb_object_agg(k, c), '{}') from (select t.status k, count(*) c from public.tasks t
          where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null group by 1) q),
      'events', (select count(*) from public.events t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null),
      'expenses', (select count(*) from public.expenses t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null),
      'expenses_total', (select coalesce(sum(t.amount), 0) from public.expenses t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null),
      'expenses_by_month', (select coalesce(jsonb_object_agg(k, c), '{}') from (select to_char(t.date, 'YYYY-MM') k, sum(t.amount) c
          from public.expenses t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null group by 1) q),
      'owed', (select count(*) from public.owed_items t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null),
      'people', (select count(*) from public.contacts t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null),
      'budget_categories', (select count(*) from public.budget_categories t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null),
      'calendar_categories', (select count(*) from public.calendar_categories t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null),
      'partnerships', (select count(*) from public.audiences t where t.user_id = p_user and t.legacy_id is not null and t.deleted_at is null),
      'saved_finds', (select count(*) from public.user_item_state t where t.user_id = p_user and t.saved_at is not null),
      'google_linked_events', (select count(*) from public.event_external_links t where t.user_id = p_user and t.event_id is not null),
      'google_call_events', (select count(*) from public.event_external_links t where t.user_id = p_user and t.contact_id is not null)
    ),
    'skipped', skipped,
    'not_imported', jsonb_build_object(
      'google_mirror_events', jsonb_array_length(coalesce(d -> 'googleEvents', '[]')),
      'note', 'Google-only events are fetched again by the server; contact photos are uploaded by the app after the import'
    ),
    'mirror', p_mirror
  );

  update public.legacy_imports i set converted_at = now(), report = v_report where i.id = p_import_id;
  return v_report;
end $$;
