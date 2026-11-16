# Supabase

- `migrations/` — the database structure. Every table has row-level security; see the header of the first file.
- `tests/access.sql` — two synthetic users must not reach each other's rows or photos. Runs in one
  transaction and rolls back.
- `tests/import.sql` — a synthetic snapshot in the app's backup format is imported, re-imported and mirrored;
  the account's numbers must match the phone's. Also rolls back.
- `tests/local_stub.sql` — a stand-in for Supabase's `auth` and `storage` schemas, for dry runs on a plain
  local Postgres: apply it, then the migrations, then run the tests.

The workflow `.github/workflows/backend.yml` first tests everything on a throwaway local copy, then applies the migrations to the project
and runs the tests. It runs only on the `migration` branch. Nothing here is used by the live app.
