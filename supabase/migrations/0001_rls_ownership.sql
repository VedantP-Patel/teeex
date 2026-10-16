-- ==============================================================================
-- Teeex — 0001: real row-level security and ownership
--
-- WHY THIS EXISTS
--
-- supabase_schema.sql enabled RLS and then wrote every policy as `using (true)`.
-- Combined with a publishable anon key (public by design, and additionally
-- hardcoded in src/services/supabaseClient.ts and committed in git history),
-- that made every row in `projects` — which stores full document contents in its
-- `files` jsonb column — readable, writable and deletable by anyone on the
-- internet. `checkpoints` was `for all using (true)`. `profiles` had blanket
-- "Admins can update/delete" policies with no caller check, so anyone could set
-- `is_admin = true` on any row. `approve_profile`/`reject_profile` were
-- `security definer` with no authorisation check and no pinned search_path.
--
-- This migration is idempotent and safe to re-run.
--
-- APPLY IT, THEN VERIFY: see docs/security/rls-verification.md. Treat all data
-- that existed before this migration as having been publicly exposed.
-- ==============================================================================

begin;

-- ------------------------------------------------------------------ helpers --

-- Membership is recorded client-side as a jsonb array of {email, role, ...}.
-- Matching on email is what the application model supports today; it is only
-- ever evaluated against `auth.jwt() ->> 'email'`, which the user cannot forge.
create or replace function public.teeex_is_project_member(
  p_members jsonb,
  p_email text
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_email is not null and exists (
    select 1
    from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) as m
    where lower(m ->> 'email') = lower(p_email)
  );
$$;

-- Editors and owners may write; viewers may not.
create or replace function public.teeex_is_project_writer(
  p_members jsonb,
  p_email text
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select p_email is not null and exists (
    select 1
    from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) as m
    where lower(m ->> 'email') = lower(p_email)
      and coalesce(m ->> 'role', 'viewer') in ('owner', 'editor')
  );
$$;

-- security definer so it can read profiles without recursing through the
-- profiles policies that call it.
create or replace function public.teeex_is_caller_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

revoke all on function public.teeex_is_caller_admin() from public;
grant execute on function public.teeex_is_caller_admin() to authenticated;

-- ----------------------------------------------------------------- projects --

-- `owner_id` is a client-derived string ("usr-" + the email with non-alphanumerics
-- stripped). A string the client chooses cannot carry authorisation, so ownership
-- moves to a real foreign key against auth.users. `owner_id` is left in place so
-- existing clients keep working; it is no longer trusted for anything.
alter table public.projects
  add column if not exists owner_uid uuid references auth.users(id) on delete cascade;

update public.projects p
set owner_uid = pr.id
from public.profiles pr
where p.owner_uid is null
  and lower(p.owner_email) = lower(pr.email);

create index if not exists projects_owner_uid_idx on public.projects (owner_uid);

-- Rows whose owner could not be resolved are unreachable under the policies
-- below: no one can read them and no one can delete them. That is the correct
-- failure mode (deny), but it means orphans need a deliberate decision.
-- docs/security/rls-verification.md includes the query to list them.

-- Ownership must never change through the data API, so UPDATE policies do not
-- have to defend against a writer reassigning a row to themselves.
create or replace function public.teeex_pin_project_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.owner_uid := old.owner_uid;

  if auth.uid() is not null
     and old.owner_uid is distinct from auth.uid() then
    new.members     := old.members;
    new.owner_email := old.owner_email;
    new.owner_id    := old.owner_id;
  end if;

  return new;
end;
$$;

drop trigger if exists teeex_projects_pin_owner on public.projects;
create trigger teeex_projects_pin_owner
  before update on public.projects
  for each row execute function public.teeex_pin_project_owner();

alter table public.projects enable row level security;
alter table public.projects force row level security;

drop policy if exists "Allow select on projects" on public.projects;
drop policy if exists "Allow insert on projects" on public.projects;
drop policy if exists "Allow update on projects" on public.projects;
drop policy if exists "Allow delete on projects" on public.projects;
drop policy if exists "projects_select_own_or_member" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own_or_writer" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own_or_member"
  on public.projects for select
  to authenticated
  using (
    owner_uid = auth.uid()
    or public.teeex_is_project_member(members, auth.jwt() ->> 'email')
  );

create policy "projects_insert_own"
  on public.projects for insert
  to authenticated
  with check (owner_uid = auth.uid());

create policy "projects_update_own_or_writer"
  on public.projects for update
  to authenticated
  using (
    owner_uid = auth.uid()
    or public.teeex_is_project_writer(members, auth.jwt() ->> 'email')
  )
  with check (
    owner_uid = auth.uid()
    or public.teeex_is_project_writer(members, auth.jwt() ->> 'email')
  );

-- Deletion is the owner's alone; a co-author with write access cannot destroy
-- someone else's paper.
create policy "projects_delete_own"
  on public.projects for delete
  to authenticated
  using (owner_uid = auth.uid());

-- -------------------------------------------------------------- checkpoints --

alter table public.checkpoints enable row level security;
alter table public.checkpoints force row level security;

drop policy if exists "Allow all on checkpoints" on public.checkpoints;
drop policy if exists "checkpoints_select_via_project" on public.checkpoints;
drop policy if exists "checkpoints_insert_via_project" on public.checkpoints;
drop policy if exists "checkpoints_update_via_project" on public.checkpoints;
drop policy if exists "checkpoints_delete_via_project" on public.checkpoints;

create policy "checkpoints_select_via_project"
  on public.checkpoints for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = checkpoints.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_member(p.members, auth.jwt() ->> 'email')
        )
    )
  );

create policy "checkpoints_insert_via_project"
  on public.checkpoints for insert
  to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = checkpoints.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_writer(p.members, auth.jwt() ->> 'email')
        )
    )
  );

create policy "checkpoints_update_via_project"
  on public.checkpoints for update
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = checkpoints.project_id and p.owner_uid = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = checkpoints.project_id and p.owner_uid = auth.uid()
    )
  );

create policy "checkpoints_delete_via_project"
  on public.checkpoints for delete
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = checkpoints.project_id and p.owner_uid = auth.uid()
    )
  );

-- ----------------------------------------------------------------- profiles --

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- "Profiles are viewable by everyone" published every registered user's email
-- address to anonymous callers. The application only ever reads its own row
-- (authService.ts selects is_approved/is_admin/full_name/avatar_color for
-- auth.uid()), so own-row access is sufficient.
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Admins can delete profiles" on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

create policy "profiles_select_self_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.teeex_is_caller_admin());

create policy "profiles_insert_self"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.teeex_is_caller_admin())
  with check (id = auth.uid() or public.teeex_is_caller_admin());

create policy "profiles_delete_admin"
  on public.profiles for delete
  to authenticated
  using (public.teeex_is_caller_admin());

-- RLS cannot restrict individual columns, and the self-update policy above has
-- to allow a user to edit their own display name. Without this trigger that same
-- policy would let them set is_admin = true on themselves.
create or replace function public.teeex_guard_profile_privileges()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (new.is_admin is distinct from old.is_admin
      or new.is_approved is distinct from old.is_approved)
     and not public.teeex_is_caller_admin() then
    raise exception
      'is_admin and is_approved can only be changed by an administrator';
  end if;
  new.id := old.id;
  new.email := old.email;
  return new;
end;
$$;

drop trigger if exists teeex_profiles_guard_privileges on public.profiles;
create trigger teeex_profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.teeex_guard_profile_privileges();

-- ------------------------------------------------- signup privilege closure --

-- The previous handle_new_user() read is_approved and is_admin out of
-- raw_user_meta_data. That field is supplied by the client in
-- supabase.auth.signUp({ options: { data } }), so anyone calling the auth
-- endpoint directly with {"data":{"is_admin":true,"is_approved":true}} was
-- granted an approved administrator profile at signup. Both are now server
-- facts, seeded false, changeable only through the admin RPCs below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_color, is_approved, is_admin)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    '#38bdf8',
    false,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- admin RPC --

create or replace function public.approve_profile(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.teeex_is_caller_admin() then
    raise exception 'not authorised';
  end if;
  update public.profiles
     set is_approved = true, updated_at = now()
   where id = target_user_id;
  return found;
end;
$$;

create or replace function public.reject_profile(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.teeex_is_caller_admin() then
    raise exception 'not authorised';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'an administrator cannot reject their own profile';
  end if;
  delete from public.profiles where id = target_user_id;
  return found;
end;
$$;

revoke all on function public.approve_profile(uuid) from public, anon;
revoke all on function public.reject_profile(uuid) from public, anon;
grant execute on function public.approve_profile(uuid) to authenticated;
grant execute on function public.reject_profile(uuid) to authenticated;

-- ------------------------------------------------------- anonymous lockdown --

-- Nothing in Teeex is readable without a session. Policies above are all scoped
-- `to authenticated`; revoking table privileges from anon means a mistake in a
-- future policy cannot re-open the tables to unauthenticated callers.
revoke all on public.projects from anon;
revoke all on public.checkpoints from anon;
revoke all on public.profiles from anon;

commit;
