-- Morning "who to call" notification, sent from here instead of a GitHub schedule (GitHub ran that
-- schedule only about twice a day, never at the reminder time). The phone keeps the people list; this
-- only knows where to send a wake-up push, at what time and in which time zone.

create table public.push_reminders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  subscription jsonb not null,           -- the browser's push subscription (endpoint + keys)
  reminder_time time not null,
  time_zone text not null,
  last_sent date,                        -- local date of the last send (or of the claim in progress)
  last_sent_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.push_reminders enable row level security;
revoke all on public.push_reminders from anon, authenticated;

-- Keys the server functions create for themselves (the push signing key). Server only.
create table public.server_keys (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.server_keys enable row level security;
revoke all on public.server_keys from anon, authenticated;

-- The signed-in user turns the reminder on or moves its time
create function public.set_push_reminder(p_subscription jsonb, p_time text, p_time_zone text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if coalesce(p_subscription ->> 'endpoint', '') !~ '^https://' then raise exception 'bad subscription'; end if;
  perform now() at time zone p_time_zone; -- an unknown zone fails here
  insert into public.push_reminders (user_id, subscription, reminder_time, time_zone)
  values (me, p_subscription, p_time::time, p_time_zone)
  on conflict (user_id) do update
    set subscription = excluded.subscription, reminder_time = excluded.reminder_time,
        time_zone = excluded.time_zone, last_error = null, updated_at = now(),
        -- a new time later today still sends today
        last_sent = case when public.push_reminders.reminder_time is distinct from excluded.reminder_time
                         then null else public.push_reminders.last_sent end;
end $$;

create function public.clear_push_reminder() returns void
language sql security definer set search_path = '' as $$
  delete from public.push_reminders where user_id = auth.uid();
$$;

create function public.push_reminder_status() returns table (reminder_time time, time_zone text, last_sent_at timestamptz, last_error text)
language sql stable security definer set search_path = '' as $$
  select r.reminder_time, r.time_zone, r.last_sent_at, r.last_error from public.push_reminders r where r.user_id = auth.uid();
$$;

-- Reminders whose time has come today (within three hours) and that were not sent yet
create function public.push_reminders_due() returns setof public.push_reminders
language sql stable security definer set search_path = '' as $$
  select r.* from public.push_reminders r
  where r.last_sent is distinct from (now() at time zone r.time_zone)::date
    and ((now() at time zone r.time_zone)::time - r.reminder_time) between interval '0' and interval '3 hours';
$$;

-- Marks the due reminders as being sent today and returns them, so two runs never send one twice
create function public.claim_push_reminders() returns setof public.push_reminders
language sql security definer set search_path = '' as $$
  update public.push_reminders r
     set last_sent = (now() at time zone r.time_zone)::date
   where r.user_id in (select d.user_id from public.push_reminders_due() d)
  returning r.*;
$$;

-- After the attempt: success keeps the claim; a failure worth retrying releases it
create function public.finish_push_reminder(p_user uuid, p_ok boolean, p_error text, p_retry boolean) returns void
language sql security definer set search_path = '' as $$
  update public.push_reminders
     set last_sent_at = case when p_ok then now() else last_sent_at end,
         last_error = case when p_ok then null else p_error end,
         last_sent = case when p_retry then null else last_sent end
   where user_id = p_user;
$$;

revoke execute on function public.set_push_reminder(jsonb, text, text), public.clear_push_reminder(),
  public.push_reminder_status(), public.push_reminders_due(), public.claim_push_reminders(),
  public.finish_push_reminder(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.set_push_reminder(jsonb, text, text), public.clear_push_reminder(),
  public.push_reminder_status() to authenticated;
grant execute on function public.set_push_reminder(jsonb, text, text), public.clear_push_reminder(),
  public.push_reminder_status(), public.push_reminders_due(), public.claim_push_reminders(),
  public.finish_push_reminder(uuid, boolean, text, boolean) to service_role;
grant all on public.push_reminders, public.server_keys to service_role;

-- every five minutes: if a reminder is due, wake the sender
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('push-reminders-when-due', '*/5 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/push-reminder',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'secret_key')),
        body := '{"action":"send-due"}'::jsonb)
      where exists (select 1 from public.push_reminders_due())
        and exists (select 1 from vault.decrypted_secrets where name = 'secret_key');
    $job$);
  end if;
end $$;
