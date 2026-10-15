# RLS verification

Acceptance test for `supabase/migrations/0001_rls_ownership.sql`. Run it after applying the migration.
Until every check below passes, the cloud layer is not safe to enable.

## Background: what was wrong

`supabase_schema.sql` enabled row-level security and then wrote every policy as `using (true)`:

```sql
create policy "Allow select on projects" on public.projects for select using (true);
create policy "Allow all on checkpoints"  on public.checkpoints for all    using (true);
create policy "Admins can update profiles" on public.profiles for update   using (true);
```

A Supabase anon key is a *publishable* credential — it is meant to ship in client code, and RLS is the
only thing standing between it and the data. With these policies there was nothing standing there.
`projects.files` holds full document contents, so every user's LaTeX source was world-readable,
world-writable and world-deletable. `fetchProjectsFromCloud()` issues a bare `select('*')` with no
filter, so the application itself was pulling every user's documents into every user's browser on
startup.

Three further holes, all closed by the migration:

- `approve_profile` / `reject_profile` were `security definer` with no caller check: any caller could
  approve themselves or delete another user's profile. Neither pinned `search_path`.
- `handle_new_user()` copied `is_approved` and `is_admin` out of `raw_user_meta_data`, which the
  client controls via `signUp({ options: { data } })`. Calling the auth endpoint directly with
  `{"data":{"is_admin":true,"is_approved":true}}` produced an approved administrator.
- `profiles` select was `using (true)`, publishing every registered email address to anonymous
  callers.

## Before you start

```bash
export SB_URL="https://<project>.supabase.co"
export SB_ANON="<anon key>"          # publishable; not a secret
```

Create two throwaway accounts, A and B, and approve them (as an admin, or directly in the dashboard).
Sign in as each and keep the `access_token` from the response:

```bash
curl -s "$SB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
  -d '{"email":"a@example.test","password":"..."}' | jq -r .access_token
```

Create one project as A through the app, and note its `id`.

## Checks

Each check states the command and the **only** acceptable result.

### 1. Anonymous callers get nothing

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$SB_URL/rest/v1/projects?select=id" -H "apikey: $SB_ANON"
curl -s -o /dev/null -w '%{http_code}\n' "$SB_URL/rest/v1/checkpoints?select=id" -H "apikey: $SB_ANON"
curl -s -o /dev/null -w '%{http_code}\n' "$SB_URL/rest/v1/profiles?select=email" -H "apikey: $SB_ANON"
```

**Required:** `401` for all three. Before the migration these returned `200` with every row.

### 2. B cannot read A's project

```bash
curl -s "$SB_URL/rest/v1/projects?select=id,title,owner_email" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN_B"
```

**Required:** `[]`, or only projects B owns or is a member of. A's project id must not appear.

### 3. B cannot write or delete A's project

```bash
curl -s -X PATCH "$SB_URL/rest/v1/projects?id=eq.$A_PROJECT_ID" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' -d '{"title":"pwned"}'

curl -s -X DELETE "$SB_URL/rest/v1/projects?id=eq.$A_PROJECT_ID" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN_B"
```

**Required:** both no-ops (`[]` / `204` affecting zero rows). Re-read as A and confirm the title is
unchanged and the row still exists.

### 4. B cannot insert a project owned by A

```bash
curl -s -X POST "$SB_URL/rest/v1/projects" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' \
  -d "{\"id\":\"proj-test-$RANDOM\",\"title\":\"t\",\"owner_id\":\"x\",\"owner_email\":\"a@example.test\",\"owner_uid\":\"$A_UID\",\"files\":[]}"
```

**Required:** rejected with a row-level-security violation (`42501`).

### 5. A user cannot promote themselves

```bash
curl -s -X PATCH "$SB_URL/rest/v1/profiles?id=eq.$B_UID" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' -d '{"is_admin":true,"is_approved":true}'
```

**Required:** error `is_admin and is_approved can only be changed by an administrator`.
Then confirm a benign self-update still works:

```bash
curl -s -X PATCH "$SB_URL/rest/v1/profiles?id=eq.$B_UID" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' -d '{"full_name":"Renamed"}'
```

**Required:** succeeds.

### 6. The admin RPCs are not open

```bash
curl -s -X POST "$SB_URL/rest/v1/rpc/approve_profile" \
  -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
  -d "{\"target_user_id\":\"$B_UID\"}"

curl -s -X POST "$SB_URL/rest/v1/rpc/approve_profile" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN_B" \
  -H 'Content-Type: application/json' -d "{\"target_user_id\":\"$B_UID\"}"
```

**Required:** the first fails on privileges (anon has no execute grant); the second fails with
`not authorised`. Repeat the second as an admin token and confirm it succeeds.

### 7. Signup cannot request privileges

```bash
curl -s "$SB_URL/auth/v1/signup" -H "apikey: $SB_ANON" -H 'Content-Type: application/json' \
  -d '{"email":"escalate@example.test","password":"...","data":{"is_admin":true,"is_approved":true}}'
```

Then, as an admin, read that profile.

**Required:** `is_admin = false` and `is_approved = false`.

### 8. Ownership cannot be reassigned

As A, try to hand the project to B:

```bash
curl -s -X PATCH "$SB_URL/rest/v1/projects?id=eq.$A_PROJECT_ID" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN_A" \
  -H 'Content-Type: application/json' -d "{\"owner_uid\":\"$B_UID\"}"
```

**Required:** the request succeeds but `owner_uid` is unchanged — the `teeex_projects_pin_owner`
trigger silently pins it. Verify by re-reading the row.

### 9. The application still works

Sign in through the UI as A: projects load, an edit syncs, a checkpoint saves and restores, and the
browser console shows no `42501` or `PGRST` errors. Sign in as B and confirm A's documents are absent.

## Orphaned rows

The backfill resolves `owner_uid` by matching `projects.owner_email` against `profiles.email`. Rows
whose owner has no profile stay `null` and are unreachable under the new policies — deny is the right
default, but it needs a decision rather than silence. List them (SQL editor, which bypasses RLS):

```sql
select id, title, owner_email, updated_at
from public.projects
where owner_uid is null
order by updated_at desc;
```

For each, either set `owner_uid` to the correct user or delete the row. Do not add a policy to make
them readable.

## Residual risks, accepted

- **Project ids were guessable.** `createProject` used `proj-${Date.now().toString(36)}`, so an
  attacker could pre-insert a row with an id a victim would later generate; the victim's upsert then
  fails on the unique constraint. The policies prevent data disclosure, not this nuisance. New
  projects use `crypto.randomUUID()`; ids created before that change remain guessable.
- **Membership is matched on email**, taken from the verified JWT claim. Adding a member to a project
  grants access to whoever controls that address at read time. Moving members to `uuid` references is
  follow-up work.
- **Pre-migration exposure is not undone.** Any data that existed while the `using (true)` policies
  were live should be assumed to have been read. Rotate the project's keys, and tell affected users.
