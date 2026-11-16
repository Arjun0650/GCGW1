-- GCGW: website enquiries, delivery status and the owner dashboard view.
-- Run once in Supabase -> SQL Editor with the project owner account.
-- Additive: it never reads, changes or removes an existing enquiry row, and it
-- also upgrades the earlier draft table in place if that one was already run.
--
-- Who can do what:
--   visitors  -> nothing directly. Submissions go through the enquiry-notify
--                Edge Function, which validates and rate-limits first.
--   owners    -> read every enquiry, and change the status column only.
--   service   -> full access (the Edge Function and the dashboard server use it).

-- Reference numbers: GC-0001, GC-0002, ...
create sequence if not exists public.enquiries_ref_seq;

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  ref text not null default 'GC-' || lpad(nextval('public.enquiries_ref_seq')::text, 4, '0'),
  name text not null,
  phone text not null,
  email text,
  location text,
  service text not null,
  property_type text,
  preferred_date date,
  message text not null,
  source_page text,
  device text,
  status text not null default 'new',
  email_status text not null default 'pending',
  whatsapp_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade an earlier draft of this table without losing anything.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'enquiries' and column_name = 'requirement'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'enquiries' and column_name = 'message'
  ) then
    alter table public.enquiries rename column requirement to message;
  end if;
end $$;

alter table public.enquiries add column if not exists ref text;
alter table public.enquiries add column if not exists property_type text;
alter table public.enquiries add column if not exists preferred_date date;
alter table public.enquiries add column if not exists message text;
alter table public.enquiries add column if not exists source_page text;
alter table public.enquiries add column if not exists device text;
alter table public.enquiries add column if not exists status text default 'new';
alter table public.enquiries add column if not exists email_status text default 'pending';
alter table public.enquiries add column if not exists whatsapp_status text default 'pending';
alter table public.enquiries add column if not exists updated_at timestamptz default now();

update public.enquiries
  set ref = 'GC-' || lpad(nextval('public.enquiries_ref_seq')::text, 4, '0')
  where ref is null;

alter table public.enquiries alter column ref set default 'GC-' || lpad(nextval('public.enquiries_ref_seq')::text, 4, '0');
alter table public.enquiries alter column ref set not null;
alter table public.enquiries alter column status set default 'new';
alter table public.enquiries alter column email_status set default 'pending';
alter table public.enquiries alter column whatsapp_status set default 'pending';
alter table public.enquiries alter column updated_at set default now();

-- Same value checks for both the fresh and upgraded table. They are added
-- NOT VALID on an older table so existing rows are never rewritten or rescanned;
-- every new insert is still checked.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'enquiries_name_len') then
    alter table public.enquiries add constraint enquiries_name_len
      check (char_length(btrim(name)) between 2 and 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enquiries_phone_shape') then
    alter table public.enquiries add constraint enquiries_phone_shape
      check (phone ~ '^\+91[6-9][0-9]{9}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enquiries_message_len') then
    alter table public.enquiries add constraint enquiries_message_len
      check (char_length(btrim(message)) between 10 and 2000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enquiries_status_values') then
    alter table public.enquiries add constraint enquiries_status_values
      check (status in ('new', 'contacted', 'site_visited', 'quoted', 'closed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enquiries_property_values') then
    alter table public.enquiries add constraint enquiries_property_values
      check (property_type is null or property_type in ('Housing society', 'Commercial', 'Industrial', 'Other')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enquiries_device_values') then
    alter table public.enquiries add constraint enquiries_device_values
      check (device is null or device in ('mobile', 'tablet', 'desktop')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enquiries_email_shape') then
    alter table public.enquiries add constraint enquiries_email_shape
      check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$') not valid;
  end if;
end $$;

grant usage on sequence public.enquiries_ref_seq to service_role;

create unique index if not exists enquiries_ref_key on public.enquiries (ref);
create index if not exists enquiries_created_at_idx on public.enquiries (created_at desc);
create index if not exists enquiries_status_idx on public.enquiries (status);

create or replace function public.enquiries_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists enquiries_touch on public.enquiries;
create trigger enquiries_touch
  before update on public.enquiries
  for each row execute function public.enquiries_touch();

-- Row-level security -------------------------------------------------------
alter table public.enquiries enable row level security;

-- The old draft allowed anonymous inserts straight into the table. That is
-- removed: direct inserts would bypass validation and the per-IP limit.
drop policy if exists "Visitors can submit an enquiry" on public.enquiries;
drop policy if exists "Owners can read enquiries" on public.enquiries;
drop policy if exists "Owners can update enquiry status" on public.enquiries;

revoke all on public.enquiries from anon, authenticated;

create policy "Owners can read enquiries"
  on public.enquiries
  for select
  to authenticated
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ));

create policy "Owners can update enquiry status"
  on public.enquiries
  for update
  to authenticated
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ))
  with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ));

-- Owners may read, and may write the status column and nothing else.
grant select on public.enquiries to authenticated;
grant update (status) on public.enquiries to authenticated;

-- The Edge Function (service role) inserts rows and records delivery status.
-- Stated explicitly so it does not depend on project default privileges.
grant all on public.enquiries to service_role;
grant usage, select on sequence public.enquiries_ref_seq to service_role;

-- Per-IP rate limit ledger (5 submissions per hour). Only the service role,
-- used by the Edge Function, can touch it.
create table if not exists public.enquiry_rate (
  id bigserial primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists enquiry_rate_lookup on public.enquiry_rate (ip_hash, created_at desc);
alter table public.enquiry_rate enable row level security;
revoke all on public.enquiry_rate from anon, authenticated;
grant all on public.enquiry_rate to service_role;
grant usage, select on sequence public.enquiry_rate_id_seq to service_role;

-- Check after running:
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'enquiries' order by ordinal_position;
-- select policyname, cmd, roles from pg_policies where tablename = 'enquiries';
-- select has_column_privilege('authenticated', 'public.enquiries', 'status', 'UPDATE') as can_update_status,
--        has_column_privilege('authenticated', 'public.enquiries', 'name', 'UPDATE') as can_update_name;
