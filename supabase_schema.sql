-- ==============================================================================
-- TEEEX STUDIO — SUPABASE DATABASE INITIALIZATION SCRIPT
-- Paste and run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql
-- ==============================================================================

-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- 2. Profiles Table (stores academic user information)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text default '',
  avatar_url text,
  avatar_color text default '#38bdf8',
  is_approved boolean default false,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add columns if the table already exists from an older version
alter table if exists public.profiles add column if not exists is_approved boolean default false;
alter table if exists public.profiles add column if not exists is_admin boolean default false;

-- Enable Row Level Security (RLS) on profiles
alter table public.profiles enable row level security;

-- Drop existing policies if re-running
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can update profiles"
  on public.profiles for update
  using ( (select is_admin from public.profiles where id = auth.uid()) = true );

create policy "Admins can delete profiles"
  on public.profiles for delete
  using ( (select is_admin from public.profiles where id = auth.uid()) = true );

-- 3. Projects Table (LaTeX files, metadata, members, and tags)
create table if not exists public.projects (
  id text primary key,
  title text not null,
  owner_id text not null,
  owner_email text not null,
  role text not null default 'owner',
  files jsonb not null default '[]'::jsonb,
  tags text[] default array[]::text[],
  members jsonb default '[]'::jsonb,
  is_archived boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on projects
alter table public.projects enable row level security;

drop policy if exists "Allow select on projects" on public.projects;
drop policy if exists "Allow insert on projects" on public.projects;
drop policy if exists "Allow update on projects" on public.projects;
drop policy if exists "Allow delete on projects" on public.projects;

create policy "Allow select on projects"
  on public.projects for select
  using (true);

create policy "Allow insert on projects"
  on public.projects for insert
  with check (true);

create policy "Allow update on projects"
  on public.projects for update
  using (true);

create policy "Allow delete on projects"
  on public.projects for delete
  using (true);

-- 4. Checkpoints Table (Version History & Time Machine)
create table if not exists public.checkpoints (
  id text primary key,
  project_id text references public.projects(id) on delete cascade,
  name text not null,
  timestamp text not null,
  author text not null,
  files jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.checkpoints enable row level security;

drop policy if exists "Allow all on checkpoints" on public.checkpoints;
create policy "Allow all on checkpoints"
  on public.checkpoints for all
  using (true);

-- 5. Enable Supabase Realtime for Projects Table
-- This powers live multi-user paper syncing across devices
alter publication supabase_realtime add table public.projects;

-- 6. Trigger to automatically create a profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_color, is_approved, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    '#38bdf8',
    coalesce((new.raw_user_meta_data->>'is_approved')::boolean, false),
    coalesce((new.raw_user_meta_data->>'is_admin')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
