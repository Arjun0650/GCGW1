-- Run this once in the Supabase SQL Editor after the existing schema migrations.
-- It enables the Owner Dashboard to work securely, including when owner.html
-- is opened directly from the project folder.
create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated;

drop policy if exists "Owners can read their own profile" on public.profiles;
create policy "Owners can read their own profile" on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists "Admins manage projects" on public.projects;
create policy "Admins manage projects" on public.projects
for all to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());

drop policy if exists "Admins manage project media" on public.project_media;
create policy "Admins manage project media" on public.project_media
for all to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());

drop policy if exists "Admins manage team members" on public.team_members;
create policy "Admins manage team members" on public.team_members
for all to authenticated
using (public.is_site_admin())
with check (public.is_site_admin());

-- It also creates the secure file bucket used by the Owner Dashboard.
insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can read site media" on storage.objects;
create policy "Public can read site media"
on storage.objects for select
using (bucket_id = 'site-media');

drop policy if exists "Admins can upload site media" on storage.objects;
create policy "Admins can upload site media"
on storage.objects for insert to authenticated
with check (bucket_id = 'site-media' and public.is_site_admin());

drop policy if exists "Admins can update site media" on storage.objects;
create policy "Admins can update site media"
on storage.objects for update to authenticated
using (bucket_id = 'site-media' and public.is_site_admin())
with check (bucket_id = 'site-media' and public.is_site_admin());

drop policy if exists "Admins can delete site media" on storage.objects;
create policy "Admins can delete site media"
on storage.objects for delete to authenticated
using (bucket_id = 'site-media' and public.is_site_admin());
