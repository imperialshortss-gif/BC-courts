-- BC Courts custom username/password authentication
-- This replaces Supabase email/password authentication for staff.
-- Passwords are stored as bcrypt hashes, never plain text.

create extension if not exists pgcrypto;

create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.staff_users enable row level security;

drop policy if exists "No public staff user access" on public.staff_users;
create policy "No public staff user access"
on public.staff_users for all
using (false)
with check (false);

-- Create/update a staff account from the Supabase SQL Editor:
-- insert into public.staff_users (username, password_hash)
-- values ('admin', crypt('YOUR_PASSWORD_HERE', gen_salt('bf')));

-- Verify a username/password without exposing the password hash.
create or replace function public.staff_login(p_username text, p_password text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_users
    where username = lower(trim(p_username))
      and password_hash = crypt(p_password, password_hash)
  );
$$;

revoke all on function public.staff_login(text, text) from public;
grant execute on function public.staff_login(text, text) to anon, authenticated;

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  record_number text not null unique,
  name text,
  status text,
  record_date date,
  description text,
  file_url text,
  file_name text,
  file_mime_type text,
  file_data bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.records enable row level security;

-- Public users can read record details. Direct writes are blocked.
drop policy if exists "Public can read records" on public.records;
create policy "Public can read records"
on public.records for select
using (true);

drop policy if exists "Staff can insert records" on public.records;
drop policy if exists "Staff can update records" on public.records;

-- Public file retrieval for a record.
create or replace function public.get_record_file(p_record_number text)
returns table(file_name text, file_mime_type text, file_data bytea)
language sql
security definer
set search_path = public
as $$
  select r.file_name, r.file_mime_type, r.file_data
  from public.records r
  where r.record_number = trim(p_record_number)
    and r.file_data is not null;
$$;

revoke all on function public.get_record_file(text) from public;
grant execute on function public.get_record_file(text) to anon, authenticated;

-- Staff save/update operation. The password is checked inside the database.
create or replace function public.save_record(
  p_username text,
  p_password text,
  p_record_number text,
  p_name text,
  p_status text,
  p_record_date date,
  p_description text,
  p_file_name text default null,
  p_file_mime_type text default null,
  p_file_data bytea default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
begin
  select public.staff_login(p_username, p_password) into ok;
  if not ok then
    raise exception 'Invalid username or password';
  end if;

  insert into public.records (
    record_number, name, status, record_date, description,
    file_name, file_mime_type, file_data, updated_at
  )
  values (
    trim(p_record_number), nullif(trim(p_name), ''), nullif(trim(p_status), ''),
    p_record_date, nullif(trim(p_description), ''),
    p_file_name, p_file_mime_type, p_file_data, now()
  )
  on conflict (record_number) do update set
    name = excluded.name,
    status = excluded.status,
    record_date = excluded.record_date,
    description = excluded.description,
    file_name = coalesce(excluded.file_name, public.records.file_name),
    file_mime_type = coalesce(excluded.file_mime_type, public.records.file_mime_type),
    file_data = coalesce(excluded.file_data, public.records.file_data),
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.save_record(text,text,text,text,text,date,text,text,text,bytea) from public;
grant execute on function public.save_record(text,text,text,text,text,date,text,text,text,bytea) to anon, authenticated;

-- Remove the old public storage bucket/policies because files are now stored with the record.
drop policy if exists "Public can view record files" on storage.objects;
drop policy if exists "Staff can upload record files" on storage.objects;
drop policy if exists "Staff can update record files" on storage.objects;
drop policy if exists "Staff can delete record files" on storage.objects;
