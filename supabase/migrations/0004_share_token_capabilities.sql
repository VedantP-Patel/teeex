-- ==============================================================================
-- Teeex — 0004: Server-Side Share Capability Tokens & Anonymous Link Access
-- Cryptographically binds edit (ed_...) and view (vw_...) tokens to Postgres RLS.
-- ==============================================================================

begin;

-- 0. Ensure pgcrypto extension is available for cryptographic token digests (SHA-256)
create extension if not exists pgcrypto;

-- 1. Add capability hash storage columns to projects table
alter table public.projects
  add column if not exists edit_token_hash text,
  add column if not exists view_token_hash text,
  add column if not exists share_tokens_revoked boolean default false,
  add column if not exists share_tokens_expires_at timestamp with time zone;

create index if not exists idx_projects_view_token_hash on public.projects (view_token_hash);
create index if not exists idx_projects_edit_token_hash on public.projects (edit_token_hash);

-- 2. Capability verification helper
create or replace function public.teeex_verify_capability(
  p_token text,
  p_hash text
)
returns boolean
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select p_token is not null
     and p_hash is not null
     and encode(digest(p_token, 'sha256'::text), 'hex') = p_hash;
$$;

-- 3. Capability token extraction from HTTP headers (x-share-token)
create or replace function public.teeex_request_share_token()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'x-share-token', ''),
    nullif(current_setting('request.headers', true)::json ->> 'x-teeex-token', '')
  );
$$;

-- 4a. Enable read access for token holders (viewers & editors)
drop policy if exists "projects_select_via_capability" on public.projects;
create policy "projects_select_via_capability"
  on public.projects for select
  to public
  using (
    share_tokens_revoked is distinct from true
    and (share_tokens_expires_at is null or share_tokens_expires_at > now())
    and (
      public.teeex_verify_capability(public.teeex_request_share_token(), view_token_hash)
      or public.teeex_verify_capability(public.teeex_request_share_token(), edit_token_hash)
    )
  );

-- 4b. Enable project updates strictly for edit capability holders (NOT viewers)
drop policy if exists "projects_update_via_capability" on public.projects;
create policy "projects_update_via_capability"
  on public.projects for update
  to public
  using (
    share_tokens_revoked is distinct from true
    and (share_tokens_expires_at is null or share_tokens_expires_at > now())
    and public.teeex_verify_capability(public.teeex_request_share_token(), edit_token_hash)
  )
  with check (
    share_tokens_revoked is distinct from true
    and (share_tokens_expires_at is null or share_tokens_expires_at > now())
    and public.teeex_verify_capability(public.teeex_request_share_token(), edit_token_hash)
  );

-- 5. Enable CRDT snapshot read access for capability token holders
drop policy if exists "crdt_states_select_via_capability" on public.project_crdt_states;
create policy "crdt_states_select_via_capability"
  on public.project_crdt_states for select
  to public
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_crdt_states.project_id
        and p.share_tokens_revoked is distinct from true
        and (p.share_tokens_expires_at is null or p.share_tokens_expires_at > now())
        and (
          public.teeex_verify_capability(public.teeex_request_share_token(), p.view_token_hash)
          or public.teeex_verify_capability(public.teeex_request_share_token(), p.edit_token_hash)
        )
    )
  );

-- 6. Enable CRDT snapshot insert & update strictly for edit capability holders (NOT viewers)
drop policy if exists "crdt_states_insert_via_capability" on public.project_crdt_states;
create policy "crdt_states_insert_via_capability"
  on public.project_crdt_states for insert
  to public
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_crdt_states.project_id
        and p.share_tokens_revoked is distinct from true
        and (p.share_tokens_expires_at is null or p.share_tokens_expires_at > now())
        and public.teeex_verify_capability(public.teeex_request_share_token(), p.edit_token_hash)
    )
  );

drop policy if exists "crdt_states_update_via_capability" on public.project_crdt_states;
create policy "crdt_states_update_via_capability"
  on public.project_crdt_states for update
  to public
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_crdt_states.project_id
        and p.share_tokens_revoked is distinct from true
        and (p.share_tokens_expires_at is null or p.share_tokens_expires_at > now())
        and public.teeex_verify_capability(public.teeex_request_share_token(), p.edit_token_hash)
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_crdt_states.project_id
        and p.share_tokens_revoked is distinct from true
        and (p.share_tokens_expires_at is null or p.share_tokens_expires_at > now())
        and public.teeex_verify_capability(public.teeex_request_share_token(), p.edit_token_hash)
    )
  );

-- 7. Enable Checkpoint read access for capability token holders
drop policy if exists "checkpoints_select_via_capability" on public.checkpoints;
create policy "checkpoints_select_via_capability"
  on public.checkpoints for select
  to public
  using (
    exists (
      select 1 from public.projects p
      where p.id = checkpoints.project_id
        and p.share_tokens_revoked is distinct from true
        and (p.share_tokens_expires_at is null or p.share_tokens_expires_at > now())
        and (
          public.teeex_verify_capability(public.teeex_request_share_token(), p.view_token_hash)
          or public.teeex_verify_capability(public.teeex_request_share_token(), p.edit_token_hash)
        )
    )
  );

-- 8. Enable Checkpoint creation strictly for edit capability holders (NOT viewers)
drop policy if exists "checkpoints_insert_via_capability" on public.checkpoints;
create policy "checkpoints_insert_via_capability"
  on public.checkpoints for insert
  to public
  with check (
    exists (
      select 1 from public.projects p
      where p.id = checkpoints.project_id
        and p.share_tokens_revoked is distinct from true
        and (p.share_tokens_expires_at is null or p.share_tokens_expires_at > now())
        and public.teeex_verify_capability(public.teeex_request_share_token(), p.edit_token_hash)
    )
  );

-- 9. Secure project owner pinning trigger to prevent capability token holders or non-owners from hijacking metadata
create or replace function public.teeex_pin_project_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.owner_uid := old.owner_uid;

  -- If the caller is not the owner (either non-owner authenticated user OR anonymous capability token holder):
  -- they cannot alter owner fields, members, or share token hashes
  if auth.uid() is null or old.owner_uid is distinct from auth.uid() then
    new.members                  := old.members;
    new.owner_email              := old.owner_email;
    new.owner_id                 := old.owner_id;
    new.edit_token_hash          := old.edit_token_hash;
    new.view_token_hash          := old.view_token_hash;
    new.share_tokens_revoked     := old.share_tokens_revoked;
    new.share_tokens_expires_at  := old.share_tokens_expires_at;
  end if;

  return new;
end;
$$;

commit;
