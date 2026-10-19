create table public.profiles (id uuid primary key references auth.users on delete cascade, is_admin boolean not null default false);
create table public.projects (id uuid primary key default gen_random_uuid(), title text not null, description text not null, category text, location text, image_url text, sort_order integer default 0, created_at timestamptz default now());
create table public.project_media (id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade, media_url text not null, media_type text not null default 'image' check (media_type in ('image','video')), alt_text text, sort_order integer default 0, created_at timestamptz default now());
create table public.team_members (id uuid primary key default gen_random_uuid(), name text not null, role text not null, photo_url text, sort_order integer default 0, created_at timestamptz default now());
alter table public.profiles enable row level security; alter table public.projects enable row level security; alter table public.project_media enable row level security; alter table public.team_members enable row level security;
create policy "Public can read projects" on public.projects for select using (true); create policy "Public can read project media" on public.project_media for select using (true); create policy "Public can read team" on public.team_members for select using (true);
-- Create the owner user in Supabase Authentication, then run this once with its UUID:
-- insert into public.profiles (id, is_admin) values ('OWNER_AUTH_USER_UUID', true);
