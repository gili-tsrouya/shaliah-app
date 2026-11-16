-- Automatic backup of the phone to the account. The app sends the same snapshot the manual copy uses;
-- this stores it, brings the account's rows in line with it, and keeps the snapshot history small:
-- the 10 newest, plus the last one of each of the 30 most recent days.
create or replace function public.sync_phone_snapshot(p_snapshot jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_report jsonb;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_snapshot ->> 'app' is distinct from 'shaliach' or jsonb_typeof(p_snapshot -> 'data') is distinct from 'object' then
    raise exception 'not a snapshot of the app';
  end if;
  if pg_column_size(p_snapshot) > 20000000 then raise exception 'snapshot too large'; end if;

  insert into public.legacy_imports (user_id, snapshot) values (v_user, p_snapshot) returning id into v_id;
  v_report := public.import_legacy_snapshot_for(v_id, v_user, true);

  delete from public.legacy_imports l
  where l.user_id = v_user
    and l.id not in (select id from public.legacy_imports where user_id = v_user order by created_at desc limit 10)
    and l.id not in (
      select id from (
        select distinct on ((created_at at time zone 'utc')::date) id, created_at
        from public.legacy_imports where user_id = v_user
        order by (created_at at time zone 'utc')::date desc, created_at desc
      ) per_day order by created_at desc limit 30);

  return v_report;
end $$;

revoke execute on function public.sync_phone_snapshot(jsonb) from public, anon;
grant execute on function public.sync_phone_snapshot(jsonb) to authenticated, service_role;
