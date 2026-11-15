-- GCGW Stage 3: website enquiries
-- Run this once in Supabase → SQL Editor with the owner/project admin account.
-- It is additive: it does not read, change or remove any existing table or row.

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 7 and 20),
  email text,
  location text,
  service text not null,
  requirement text not null check (char_length(btrim(requirement)) between 10 and 4000),
  source text not null default 'website',
  created_at timestamptz not null default now()
);

create index if not exists enquiries_created_at_idx on public.enquiries (created_at desc);

alter table public.enquiries enable row level security;

-- Visitors may only insert. There is deliberately no select, update or delete
-- policy, so the public key cannot read anybody's enquiry.
drop policy if exists "Visitors can submit an enquiry" on public.enquiries;
create policy "Visitors can submit an enquiry"
  on public.enquiries
  for insert
  to anon, authenticated
  with check (true);

-- Defence in depth: remove the default table privileges, then grant insert only.
revoke all on public.enquiries from anon, authenticated;
grant insert on public.enquiries to anon, authenticated;

-- Basic server-side rate limit: at most 3 enquiries from the same phone number
-- in any 10-minute window. The owner dashboard (service role) is unaffected.
create or replace function public.enquiries_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.enquiries
    where phone = btrim(new.phone)
      and created_at > now() - interval '10 minutes'
  ) >= 3 then
    raise exception 'Too many enquiries from this number. Please call +91 93985 77232.';
  end if;
  return new;
end;
$$;

drop trigger if exists enquiries_rate_limit on public.enquiries;
create trigger enquiries_rate_limit
  before insert on public.enquiries
  for each row execute function public.enquiries_rate_limit();

-- Check after running:
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns where table_schema = 'public' and table_name = 'enquiries' order by ordinal_position;
-- select policyname, cmd, roles from pg_policies where tablename = 'enquiries';
