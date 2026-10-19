-- Run this once in the Supabase SQL Editor after the existing schema migrations.
-- It creates the secure file bucket used by the Owner Dashboard.
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
with check (bucket_id = 'site-media' and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Admins can update site media" on storage.objects;
create policy "Admins can update site media"
on storage.objects for update to authenticated
using (bucket_id = 'site-media' and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
with check (bucket_id = 'site-media' and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

drop policy if exists "Admins can delete site media" on storage.objects;
create policy "Admins can delete site media"
on storage.objects for delete to authenticated
using (bucket_id = 'site-media' and exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
