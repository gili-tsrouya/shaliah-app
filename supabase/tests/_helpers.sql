-- Shared by the test files; created inside the test's transaction and rolled back with it.
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
