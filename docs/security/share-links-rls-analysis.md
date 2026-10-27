# Share Links vs. Supabase Row-Level Security (RLS) Analysis

This document provides a comprehensive security review and architectural analysis of project sharing capability tokens (`shareSecurityService.ts`) versus database-level enforcement in Supabase migrations (`0001_rls_ownership.sql` and `0002_yjs_collaboration.sql`).

---

## 1. Executive Summary & Confirmation

- **User Inquiry**: Does migration `0002_yjs_collaboration.sql` (or `0001_rls_ownership.sql`) verify share tokens or roles, or are share links enforced purely on the client?
- **Finding**: **Confirmed**. Share capability tokens (`ed_<random_32_hex>` and `vw_<sha256_hash>`) are enforced **exclusively in the client application** (`shareSecurityService.ts`). Neither `0001_rls_ownership.sql` nor `0002_yjs_collaboration.sql` inspects or verifies share tokens.

---

## 2. Policy Enforcement Breakdown

### Migration `0001_rls_ownership.sql`
In `0001_rls_ownership.sql`, policies are defined on `public.projects`, `public.checkpoints`, and `public.profiles`:

```sql
-- Read Policy
create policy "projects_select_own_or_member"
  on public.projects for select
  to authenticated
  using (
    owner_uid = auth.uid()
    or public.teeex_is_project_member(members, auth.jwt() ->> 'email')
  );

-- Update Policy
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
```

### Migration `0002_yjs_collaboration.sql`
In `0002_yjs_collaboration.sql`, policies are defined on `public.project_crdt_states`:

```sql
-- Select policy
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

-- Insert & Update policy
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
  );
```

---

## 3. Threat Model & Security Boundaries

| Collaborator Type | Client Enforcement (`shareSecurityService.ts`) | Server / Database Enforcement (`Postgres RLS`) |
| :--- | :--- | :--- |
| **Anonymous Visitor** | Evaluates `?key=ed_...` or `?key=vw_...` locally | **Blocked 100%**: All DB policies are `to authenticated`. Cannot read or write `projects` or `project_crdt_states`. |
| **Logged-In User (Not in `members`)** | Sets editor to `readOnly` if given `vw_...` | **Blocked 100%**: User email is not in `members` and `auth.uid() != owner_uid`. All DB queries fail with RLS denial. |
| **Invited Viewer (in `members` with `role: viewer`)** | Sets editor to `readOnly` | **Enforced**: `teeex_is_project_writer` checks `m ->> 'role' in ('owner', 'editor')`. DB blocks update queries. |
| **Invited Editor given View Link** | Sets UI to `readOnly` based on `?key=vw_...` | **Vulnerable to UI bypass**: Because the server only checks `members` (where they are listed as editor), a direct Supabase REST/GraphQL call succeeds. |

---

## 4. Architectural Remediation Blueprint: Migration 0004

To enforce capability tokens on the server without forcing guest users to create accounts, projects can store cryptographic hashes of the active `edit_token` and `view_token`:

```sql
-- ==============================================================================
-- Teeex — 0004: Server-Side Share Capability Tokens & Anonymous Link Access
-- ==============================================================================

create extension if not exists pgcrypto;

alter table public.projects
  add column if not exists edit_token_hash text,
  add column if not exists view_token_hash text,
  add column if not exists share_tokens_revoked boolean default false;

-- Allow read access via view token or edit token passed via header or RPC:
create or replace function public.teeex_verify_token(p_token text, p_hash text)
returns boolean
language sql
stable
set search_path = public, extensions, pg_temp
as $$
  select p_token is not null
     and p_hash is not null
     and encode(digest(p_token, 'sha256'::text), 'hex') = p_hash;
$$;
```

When projects are saved to the cloud, the owner's client sends `sha256(editToken)` and `sha256(viewToken)` to the server. Then, Postgres functions or session headers allow access even for unauthenticated link holders while strictly preventing view-link holders from executing edit operations.
