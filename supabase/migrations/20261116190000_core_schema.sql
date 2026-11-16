-- Core schema for השליח: every private row belongs to one user and is guarded by row-level security.
-- Rules of this file:
--   * every table has RLS enabled; a table with no policy is reachable only by server code
--   * the anonymous API role gets nothing
--   * links between a user's rows carry user_id, so a row can never point at another user's row
--   * `legacy_id` keeps the id a row had in the phone's localStorage, so imports can be repeated safely

-- ---------- helpers ----------

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- New tables and functions in this schema are not handed to the API roles automatically
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;

-- ---------- people and setup ----------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  locale text not null default 'he',
  timezone text not null default 'America/New_York',
  monthly_budget numeric(10,2),
  saving_goal numeric(10,2),
  reminder_time time,
  age smallint check (age between 13 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shlichut_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  city text not null,
  -- two decimals is about 1 km: enough to search nearby, not enough to find a home
  lat numeric(5,2),
  lng numeric(5,2),
  starts_on date,
  ends_on date,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index on public.shlichut_assignments (user_id);

-- The communities a shaliach works with (the app calls them partnerships)
create table public.audiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  name text not null,
  community text[] not null default '{}',
  age_from smallint,
  age_to smallint,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

-- What the discovery agents may know about a user's search: no name, contacts or budget
create table public.agent_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  search_place text,
  lat numeric(5,2),
  lng numeric(5,2),
  range_miles smallint,
  include_nyc boolean not null default false,
  max_price smallint,
  topics text[] not null default '{}',
  interests text[] not null default '{}',
  extra text,
  away_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- calendar ----------

create table public.calendar_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  label text not null,
  color text not null default 'gray',
  -- youth-work categories: photos attached to their events are treated as possibly showing minors
  is_youth boolean not null default false,
  google_calendar_id text,
  sort smallint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  unique (id, user_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  category_id uuid,
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  due date,
  note text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.calendar_categories (id, user_id) on delete set null (category_id)
);
create index on public.tasks (user_id) where deleted_at is null;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  name text not null,
  every_days smallint not null default 7 check (every_days > 0),
  last_talk date,
  phone text,
  photo_path text,
  call_days smallint[],
  call_time time,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  unique (id, user_id)
);

create table public.contact_touches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null,
  touched_on date,
  grade text not null check (grade in ('g', 'y', 'r')),
  -- position in the history the phone kept (oldest first); null for touches logged after the move
  legacy_seq smallint,
  created_at timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade,
  unique (contact_id, legacy_seq)
);
create index on public.contact_touches (user_id, contact_id);

-- The app's own calendar: the source of truth. Google is an optional copy.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  category_id uuid,
  title text not null,
  kind text not null default 'event' check (kind in ('event', 'deadline', 'vacation')),
  date date not null,
  end_date date,
  start_time time,
  end_time time,
  task_id uuid,
  contact_id uuid,
  discovery_item_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  unique (id, user_id),
  check (end_date is null or end_date >= date),
  foreign key (category_id, user_id) references public.calendar_categories (id, user_id) on delete set null (category_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete set null (task_id),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete set null (contact_id)
);
create index on public.events (user_id, date) where deleted_at is null;

-- Which Google event mirrors which of our events (or a contact's repeating call).
-- Written only by server code; the owner may read it to show sync state.
create table public.event_external_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid,
  contact_id uuid,
  provider text not null default 'google' check (provider in ('google')),
  external_calendar_id text not null,
  external_event_id text not null,
  etag text,
  sync_state text not null default 'synced' check (sync_state in ('synced', 'pending', 'error', 'gone')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(event_id, contact_id) = 1),
  foreign key (event_id, user_id) references public.events (id, user_id) on delete cascade,
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade,
  -- one Google event can be linked once, and one of our events has one copy per provider: no duplicates
  unique (user_id, provider, external_calendar_id, external_event_id)
);
create unique index on public.event_external_links (event_id, provider) where event_id is not null;
create unique index on public.event_external_links (contact_id, provider) where contact_id is not null;

-- Events that exist only in Google, shown as a read-only layer. Server-written.
create table public.external_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  external_calendar_id text not null,
  external_event_id text not null,
  title text not null default '',
  date date not null,
  end_date date,
  start_time time,
  end_time time,
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_calendar_id, external_event_id)
);
create index on public.external_events (user_id, date);

-- Work waiting to be sent to Google. Server only.
create table public.sync_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid,
  contact_id uuid,
  op text not null check (op in ('upsert', 'delete')),
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  done_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index on public.sync_outbox (next_attempt_at) where done_at is null;

-- A user's Google Calendar connection. Server only: the refresh token is stored encrypted and
-- no API role can read this table at all.
create table public.google_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_ciphertext text not null,
  key_version smallint not null default 1,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect', 'missing_permission')),
  last_error text,
  last_sync_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One-time values for the Google connect flow. Server only.
create table public.google_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_verifier text not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);

-- What the app may know about the connection: its state, never the token
create or replace function public.google_connection_status()
returns table (status text, scopes text[], last_sync_at timestamptz, last_error text, connected_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.status, c.scopes, c.last_sync_at, c.last_error, c.connected_at
  from public.google_connections c
  where c.user_id = (select auth.uid())
$$;

-- ---------- budget ----------

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  name text not null,
  plan numeric(10,2) not null default 0,
  sort smallint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  unique (id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  category_id uuid,
  amount numeric(10,2) not null,
  note text not null default '',
  date date not null,
  is_refund boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  foreign key (category_id, user_id) references public.budget_categories (id, user_id) on delete set null (category_id)
);
create index on public.expenses (user_id, date) where deleted_at is null;

create table public.owed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  legacy_id text,
  category_id uuid,
  who text not null,
  what text not null default '',
  amount numeric(10,2) not null,
  date date not null,
  settled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id),
  foreign key (category_id, user_id) references public.budget_categories (id, user_id) on delete set null (category_id)
);

-- ---------- discovery: the shared catalog (public event data only) ----------

create table public.discovery_items (
  id text primary key,
  feed text not null check (feed in ('deals', 'shlichut')),
  title text not null,
  summary text,
  category text not null,
  when_text text,
  date date,
  place text,
  price_text text,
  price_value numeric(8,2),
  lat numeric(8,5),
  lng numeric(8,5),
  url text,
  idea text,
  region text,
  image jsonb,
  status text not null default 'active' check (status in ('active', 'gone')),
  expires_on date,
  first_seen_at timestamptz not null default now(),
  -- moves only when something a user would care about changed (date, price, status, place)
  updated_at timestamptz not null default now()
);
create index on public.discovery_items (feed, status);

create table public.discovery_item_changes (
  id bigint generated always as identity primary key,
  item_id text not null references public.discovery_items (id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);
create index on public.discovery_item_changes (item_id, changed_at);

-- Ideas tailored to a kind of audience ("ישראלית 15-18"), never to a person
create table public.audience_ideas (
  item_id text not null references public.discovery_items (id) on delete cascade,
  audience_key text not null,
  idea text not null,
  primary key (item_id, audience_key)
);

-- ---------- discovery: what one user did with the catalog ----------

create table public.user_item_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.discovery_items (id) on delete cascade,
  seen_version timestamptz,
  saved_at timestamptz,
  skipped_at timestamptz,
  skip_reason text,
  done_at timestamptz,
  done_outcome text,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- Raw signals, kept 180 days and then trimmed by a scheduled job
create table public.interaction_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text,
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on public.interaction_events (user_id, created_at);

-- ---------- journal ----------

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  event_id uuid,
  discovery_item_id text,
  body text,
  mood text,
  tags text[] not null default '{}',
  kind text not null default 'personal' check (kind in ('personal', 'shlichut')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- deleting an event never deletes the memory of it
  foreign key (event_id, user_id) references public.events (id, user_id) on delete set null (event_id)
);
create index on public.memories (user_id, date) where deleted_at is null;

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  memory_id uuid not null,
  taken_at timestamptz,
  width integer,
  height integer,
  caption text,
  bytes integer,
  sha256 text,
  has_original boolean not null default false,
  upload_state text not null default 'pending' check (upload_state in ('pending', 'uploaded', 'failed')),
  -- true = may show identifiable minors: never leaves the app as an image
  may_show_minors boolean not null default false,
  minors_cleared_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (memory_id, user_id) references public.memories (id, user_id) on delete cascade
);
create index on public.photos (user_id, memory_id);

-- A photo of youth work starts out flagged; the flag can only be cleared one photo at a time,
-- and clearing it is recorded.
create or replace function public.photos_minor_flag() returns trigger
language plpgsql set search_path = '' as $$
declare
  youth boolean;
begin
  if tg_op = 'INSERT' then
    select m.kind = 'shlichut' or coalesce(c.is_youth, false) into youth
    from public.memories m
    left join public.events e on e.id = m.event_id
    left join public.calendar_categories c on c.id = e.category_id
    where m.id = new.memory_id;
    if coalesce(youth, false) then
      new.may_show_minors := true;
      new.minors_cleared_at := null;
    end if;
  elsif old.may_show_minors and not new.may_show_minors then
    new.minors_cleared_at := now();
  elsif new.may_show_minors then
    new.minors_cleared_at := null;
  end if;
  return new;
end $$;
create trigger photos_minor_flag before insert or update on public.photos
  for each row execute function public.photos_minor_flag();

create or replace function public.photos_no_bulk_unflag() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from old_rows o join new_rows n on n.id = o.id where o.may_show_minors and not n.may_show_minors) > 1 then
    raise exception 'the minors flag can only be cleared one photo at a time';
  end if;
  return null;
end $$;
create trigger photos_no_bulk_unflag after update on public.photos
  referencing old table as old_rows new table as new_rows
  for each statement execute function public.photos_no_bulk_unflag();

create table public.recap_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_kind text not null check (period_kind in ('week', 'month')),
  period_start date not null,
  edits jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_kind, period_start)
);

-- ---------- other ----------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  reminder_time time,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- The untouched snapshot of the phone's old data: kept for checking and for importing again.
-- The owner can add and read snapshots, never change or remove them.
create table public.legacy_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  converted_at timestamptz,
  report jsonb
);
create index on public.legacy_imports (user_id);

-- Every change to a user's rows after the move, so a rollback can export exactly what is new
create table public.change_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  table_name text not null,
  row_id text not null,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  device text,
  changed_at timestamptz not null default now()
);
create index on public.change_log (user_id, changed_at);

-- Runs of scheduled jobs, for monitoring. Server only.
create table public.job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  stats jsonb,
  error text
);
create index on public.job_runs (job, started_at desc);

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  device text;
begin
  begin
    device := nullif(current_setting('request.headers', true), '')::json ->> 'x-device-id';
  exception when others then
    device := null;
  end;
  -- the account itself is being deleted: its rows go by cascade, and so does its history
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = (r ->> 'user_id')::uuid) then
    delete from public.change_log c where c.user_id = (r ->> 'user_id')::uuid;
    return old;
  end if;
  insert into public.change_log (user_id, table_name, row_id, op, old_row, new_row, device)
  values (
    (r ->> 'user_id')::uuid,
    tg_table_name,
    coalesce(r ->> 'id', r ->> 'item_id', r ->> 'user_id'),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    device
  );
  return coalesce(new, old);
end $$;

-- ---------- triggers: updated_at and the change log ----------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'shlichut_assignments', 'audiences', 'agent_preferences', 'calendar_categories', 'tasks',
    'contacts', 'events', 'event_external_links', 'external_events', 'google_connections', 'budget_categories',
    'expenses', 'owed_items', 'user_item_state', 'memories', 'photos', 'recap_edits', 'push_subscriptions'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;

  -- the tables a rollback has to be able to replay; never the Google tokens
  foreach t in array array[
    'profiles', 'shlichut_assignments', 'audiences', 'agent_preferences', 'calendar_categories', 'tasks',
    'contacts', 'contact_touches', 'events', 'budget_categories', 'expenses', 'owed_items', 'user_item_state',
    'memories', 'photos', 'recap_edits'
  ] loop
    execute format('create trigger log_change after insert or update or delete on public.%I for each row execute function public.log_change()', t);
  end loop;
end $$;

-- ---------- row-level security ----------

do $$
declare
  t text;
begin
  -- RLS on everything in this schema; no table is left open
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;

  -- private tables: the owner reads and writes their own rows, nobody else's
  foreach t in array array[
    'profiles', 'shlichut_assignments', 'audiences', 'agent_preferences', 'calendar_categories', 'tasks',
    'contacts', 'contact_touches', 'events', 'budget_categories', 'expenses', 'owed_items', 'user_item_state',
    'memories', 'photos', 'recap_edits', 'push_subscriptions'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;

  -- owner may read, only server code writes
  foreach t in array array['event_external_links', 'external_events', 'change_log'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy own_rows_read on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- snapshots and raw signals: the owner may add and read, never rewrite
grant select, insert on public.legacy_imports, public.interaction_events to authenticated;
create policy own_rows_read on public.legacy_imports for select to authenticated using (user_id = (select auth.uid()));
create policy own_rows_add on public.legacy_imports for insert to authenticated with check (user_id = (select auth.uid()));
create policy own_rows_read on public.interaction_events for select to authenticated using (user_id = (select auth.uid()));
create policy own_rows_add on public.interaction_events for insert to authenticated with check (user_id = (select auth.uid()));

-- the shared catalog: any signed-in user may read, only server code writes
grant select on public.discovery_items, public.discovery_item_changes, public.audience_ideas to authenticated;
create policy catalog_read on public.discovery_items for select to authenticated using (true);
create policy catalog_read on public.discovery_item_changes for select to authenticated using (true);
create policy catalog_read on public.audience_ideas for select to authenticated using (true);

-- sync_outbox, google_connections, google_oauth_states, job_runs: RLS on, no policy, no grant = server only

-- functions are callable through the API only when granted here by name
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.google_connection_status() to authenticated;

-- the server role keeps full access (it bypasses RLS but still needs table privileges)
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ---------- private photo storage ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- files live under {user id}/…; a user can only touch paths that start with their own id
create policy media_own_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_own_add on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_own_change on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_own_remove on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
