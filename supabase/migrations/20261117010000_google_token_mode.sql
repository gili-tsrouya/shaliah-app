-- Two ways a Google connection can be used:
--   'browser' (default): the server only keeps the lasting permission and hands the signed-in owner a
--             short-lived access token; the app syncs the calendar itself, as it always has.
--   'server': the server sends calendar changes to Google from the outbox.
-- Only one of them may write a user's events, otherwise Google would get every event twice. So nothing
-- is queued for a 'browser' connection.
alter table public.google_connections
  add column sync_mode text not null default 'browser' check (sync_mode in ('browser', 'server'));

create or replace function public.sync_outbox_only_server() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.google_connections c where c.user_id = new.user_id and c.sync_mode = 'server') then
    return null;
  end if;
  return new;
end $$;
create trigger sync_outbox_only_server before insert on public.sync_outbox
  for each row execute function public.sync_outbox_only_server();

delete from public.sync_outbox o
where o.done_at is null
  and not exists (select 1 from public.google_connections c where c.user_id = o.user_id and c.sync_mode = 'server');

revoke execute on function public.sync_outbox_only_server() from public, anon, authenticated;
