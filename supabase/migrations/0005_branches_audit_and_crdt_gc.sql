-- ==============================================================================
-- Teeex — 0005: Cloud-Synced Branches, Append-Only Audit Logs & Yjs CRDT GC
-- Matched to 0001_rls_ownership.sql & 0002_yjs_collaboration.sql
-- ==============================================================================

begin;

-- ---------------------------------------------------------- project_branches --

create table if not exists public.project_branches (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  head_checkpoint_id text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists idx_project_branches_project
  on public.project_branches (project_id, updated_at desc);

alter table public.project_branches enable row level security;
alter table public.project_branches force row level security;

drop policy if exists "project_branches_select_member" on public.project_branches;
drop policy if exists "project_branches_write_editor" on public.project_branches;

create policy "project_branches_select_member"
  on public.project_branches for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_branches.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_member(p.members, auth.jwt() ->> 'email')
        )
    )
  );

create policy "project_branches_write_editor"
  on public.project_branches for all
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_branches.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_writer(p.members, auth.jwt() ->> 'email')
        )
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_branches.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_writer(p.members, auth.jwt() ->> 'email')
        )
    )
  );

-- -------------------------------------------------------- project_audit_logs --

create table if not exists public.project_audit_logs (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  actor_uid uuid default auth.uid() references auth.users(id) on delete set null,
  action text not null,
  detail text not null default '',
  user_name text not null default '',
  user_role text not null default 'member',
  category text not null default 'document',
  created_at timestamptz not null default now()
);

create index if not exists idx_project_audit_logs_project_time
  on public.project_audit_logs (project_id, created_at desc);

alter table public.project_audit_logs enable row level security;
alter table public.project_audit_logs force row level security;

drop policy if exists "audit_logs_select_member" on public.project_audit_logs;
drop policy if exists "audit_logs_insert_member" on public.project_audit_logs;

create policy "audit_logs_select_member"
  on public.project_audit_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_audit_logs.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_member(p.members, auth.jwt() ->> 'email')
        )
    )
  );

create policy "audit_logs_insert_member"
  on public.project_audit_logs for insert
  to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_audit_logs.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_member(p.members, auth.jwt() ->> 'email')
        )
    )
  );
-- Intentionally no UPDATE or DELETE policies: audit history is append-only.

-- ------------------------------------------------- Yjs CRDT snapshot GC RPC --

alter table public.project_crdt_states
  add column if not exists state_version bigint not null default 1;

create or replace function public.compact_project_crdt_state(
  p_project_id text,
  p_compacted_snapshot text,
  p_state_vector text,
  p_expected_version bigint
) returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_version bigint;
begin
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (
        p.owner_uid = auth.uid()
        or public.teeex_is_project_writer(p.members, auth.jwt() ->> 'email')
      )
  ) then
    raise exception 'Insufficient permissions to compact CRDT state';
  end if;

  update public.project_crdt_states
     set snapshot = p_compacted_snapshot,
         state_vector = p_state_vector,
         state_version = state_version + 1,
         updated_at = now(),
         updated_by = auth.uid()
   where project_id = p_project_id
     and state_version = p_expected_version
  returning state_version into v_new_version;

  if v_new_version is null then
    raise exception 'CRDT_VERSION_CONFLICT';
  end if;

  return v_new_version;
end;
$$;

revoke all on function public.compact_project_crdt_state(text, text, text, bigint) from public, anon;
grant execute on function public.compact_project_crdt_state(text, text, text, bigint) to authenticated;

revoke all on public.project_branches from anon;
revoke all on public.project_audit_logs from anon;

commit;