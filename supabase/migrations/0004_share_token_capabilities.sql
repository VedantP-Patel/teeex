-- ==============================================================================
-- Teeex — 0004: Server-Side Share Capability Tokens & Anonymous Link Access
-- Cryptographically binds edit (ed_...) and view (vw_...) tokens to Postgres RLS.
-- ==============================================================================

begin;

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
set search_path = public, pg_temp
as $$
  select p_token is not null
     and p_hash is not null
     and encode(digest(p_token, 'sha256'), 'hex') = p_hash;
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

-- 4. Enable read access for token holders (viewers & editors)
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

-- 6. Enable CRDT snapshot write/update strictly for edit capability holders (NOT viewers)
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

commit;
