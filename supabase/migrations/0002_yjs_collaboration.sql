-- ==============================================================================
-- Teeex — 0002: Yjs CRDT Collaboration States & Snapshots
-- Idempotent migration extending the hardened RLS schema.
-- ==============================================================================

create table if not exists public.project_crdt_states (
  project_id text primary key references public.projects(id) on delete cascade,
  snapshot text not null, -- Base64-encoded Yjs binary update snapshot
  state_vector text,      -- Base64-encoded state vector for fast delta comparison
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.project_crdt_states enable row level security;
alter table public.project_crdt_states force row level security;

-- Drop existing policies if re-running
drop policy if exists "crdt_states_select_via_project" on public.project_crdt_states;
drop policy if exists "crdt_states_insert_via_project" on public.project_crdt_states;
drop policy if exists "crdt_states_update_via_project" on public.project_crdt_states;

-- Select policy: Owners and members can read CRDT snapshots
create policy "crdt_states_select_via_project"
  on public.project_crdt_states for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_crdt_states.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_member(p.members, auth.jwt() ->> 'email')
        )
    )
  );

-- Insert policy: Owners and editors can insert CRDT snapshots
create policy "crdt_states_insert_via_project"
  on public.project_crdt_states for insert
  to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_crdt_states.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_writer(p.members, auth.jwt() ->> 'email')
        )
    )
  );

-- Update policy: Owners and editors can update CRDT snapshots
create policy "crdt_states_update_via_project"
  on public.project_crdt_states for update
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_crdt_states.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_writer(p.members, auth.jwt() ->> 'email')
        )
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_crdt_states.project_id
        and (
          p.owner_uid = auth.uid()
          or public.teeex_is_project_writer(p.members, auth.jwt() ->> 'email')
        )
    )
  );
