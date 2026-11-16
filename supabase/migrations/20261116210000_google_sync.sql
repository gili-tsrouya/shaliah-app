-- Google Calendar sync, server side. Saving an event never waits for Google: a trigger adds a line to
-- sync_outbox and a scheduled server function sends it later, retrying on failure.

-- a delete needs to know which Google event to remove even after our own rows are gone
alter table public.sync_outbox add column external_calendar_id text;
alter table public.sync_outbox add column external_event_id text;

create or replace function public.events_enqueue_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    -- the event row is going away: remember its Google copies, the link rows vanish with it
    insert into public.sync_outbox (user_id, op, external_calendar_id, external_event_id)
    select l.user_id, 'delete', l.external_calendar_id, l.external_event_id
    from public.event_external_links l
    where l.event_id = old.id and l.provider = 'google'
      and exists (select 1 from auth.users u where u.id = old.user_id);
    return old;
  end if;

  -- nothing to send for a user who has not connected Google
  if not exists (select 1 from public.google_connections c where c.user_id = new.user_id) then
    return new;
  end if;
  -- one waiting line per event is enough: the sender reads the event as it is when it runs
  if not exists (select 1 from public.sync_outbox o where o.event_id = new.id and o.done_at is null and o.attempts = 0) then
    insert into public.sync_outbox (user_id, event_id, op) values (new.user_id, new.id, 'upsert');
  end if;
  return new;
end $$;

create trigger enqueue_sync_change after insert or update on public.events
  for each row execute function public.events_enqueue_sync();
create trigger enqueue_sync_delete before delete on public.events
  for each row execute function public.events_enqueue_sync();

-- changing which Google calendar a category uses re-sends that category's coming events
create or replace function public.categories_enqueue_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.google_calendar_id is distinct from old.google_calendar_id
     and exists (select 1 from public.google_connections c where c.user_id = new.user_id) then
    insert into public.sync_outbox (user_id, event_id, op)
    select e.user_id, e.id, 'upsert' from public.events e
    where e.category_id = new.id and e.deleted_at is null and coalesce(e.end_date, e.date) >= current_date - 1;
  end if;
  return new;
end $$;
create trigger enqueue_sync_calendar after update on public.calendar_categories
  for each row execute function public.categories_enqueue_sync();

-- after connecting: send everything that is still ahead
create or replace function public.enqueue_upcoming_events(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.sync_outbox (user_id, event_id, op)
  select e.user_id, e.id, 'upsert' from public.events e
  join public.calendar_categories c on c.id = e.category_id and c.google_calendar_id is not null
  where e.user_id = p_user and e.deleted_at is null and coalesce(e.end_date, e.date) >= current_date - 1
    and not exists (select 1 from public.sync_outbox o where o.event_id = e.id and o.done_at is null and o.attempts = 0);
  get diagnostics n = row_count;
  return n;
end $$;

-- the sender takes a batch; a line it takes is hidden from other runs for a few minutes
create or replace function public.claim_sync_outbox(p_limit integer default 20)
returns setof public.sync_outbox
language sql security definer set search_path = '' as $$
  update public.sync_outbox o set next_attempt_at = now() + interval '5 minutes'
  where o.id in (
    select s.id from public.sync_outbox s
    join public.google_connections c on c.user_id = s.user_id and c.status = 'connected'
    where s.done_at is null and s.next_attempt_at <= now()
    order by s.id limit p_limit for update of s skip locked)
  returning o.*
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.google_connection_status() to authenticated;
grant execute on function public.import_legacy_snapshot(uuid, boolean) to authenticated;
grant execute on all functions in schema public to service_role;

-- every minute: if something is waiting, wake the sender. The project address and a server key are read
-- from the Vault (stored there by the deploy workflow, never in this file).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('google-sync-when-needed', '* * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/google-sync',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')),
        body := '{"source":"cron"}'::jsonb)
      where exists (select 1 from public.sync_outbox o
                    join public.google_connections c on c.user_id = o.user_id and c.status = 'connected'
                    where o.done_at is null and o.next_attempt_at <= now())
        and exists (select 1 from vault.decrypted_secrets where name = 'secret_key');
    $job$);
    -- finished lines are kept a week for troubleshooting, then removed
    perform cron.schedule('sync-outbox-tidy', '17 3 * * *',
      $job$ delete from public.sync_outbox where done_at < now() - interval '7 days' $job$);
  end if;
end $$;
