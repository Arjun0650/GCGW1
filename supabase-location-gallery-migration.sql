-- Run this once in Supabase SQL Editor for an existing GCGW database.
create table if not exists public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  media_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  alt_text text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table public.project_media enable row level security;
drop policy if exists "Public can read project media" on public.project_media;
create policy "Public can read project media" on public.project_media for select using (true);
