-- BC Courts Record Lookup CMS
-- Run this in Supabase SQL Editor after creating the project.

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  record_number text not null unique,
  name text,
  status text,
  record_date date,
  description text,
  file_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.records enable row level security;

-- Public users may search/read records. They cannot insert, update, or delete.
drop policy if exists "Public can read records" on public.records;
create policy "Public can read records"
on public.records for select
using (true);

-- Signed-in staff can create and update records.
drop policy if exists "Staff can insert records" on public.records;
create policy "Staff can insert records"
on public.records for insert
to authenticated
with check (true);

drop policy if exists "Staff can update records" on public.records;
create policy "Staff can update records"
on public.records for update
to authenticated
using (true)
with check (true);

-- Storage bucket for one details file per record.
insert into storage.buckets (id, name, public)
values ('record-files', 'record-files', true)
on conflict (id) do update set public = true;

-- Anyone can view attached public files.
drop policy if exists "Public can view record files" on storage.objects;
create policy "Public can view record files"
on storage.objects for select
using (bucket_id = 'record-files');

-- Only authenticated staff can upload/delete files.
drop policy if exists "Staff can upload record files" on storage.objects;
create policy "Staff can upload record files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'record-files');

drop policy if exists "Staff can update record files" on storage.objects;
create policy "Staff can update record files"
on storage.objects for update
to authenticated
using (bucket_id = 'record-files')
with check (bucket_id = 'record-files');

drop policy if exists "Staff can delete record files" on storage.objects;
create policy "Staff can delete record files"
on storage.objects for delete
to authenticated
using (bucket_id = 'record-files');
