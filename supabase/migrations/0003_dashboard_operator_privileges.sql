-- ==============================================================================
-- Teeex — 0003: Allow Supabase Dashboard Operators & Superusers to Manage Profiles
-- Fixes trigger error when editing is_approved / is_admin in Supabase Table Editor.
-- ==============================================================================

create or replace function public.teeex_is_caller_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (
    current_user in ('postgres', 'supabase_admin', 'service_role')
    or (auth.jwt() ->> 'role') = 'service_role'
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );
$$;

revoke all on function public.teeex_is_caller_admin() from public;
grant execute on function public.teeex_is_caller_admin() to authenticated, service_role;
