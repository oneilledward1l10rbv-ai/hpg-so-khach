-- Sổ khách & lợi nhuận HPG — chạy 1 lần trong Supabase → SQL Editor → New query → Run

create table if not exists public.clients (
  id text primary key,                 -- Mã KH, vd KH001
  date date,
  contact text default '',
  phone text default '',
  facility text default '',
  model text default '',
  service text default '',
  status text default '1. Mới tiếp nhận',
  owner text default '',
  contract_value bigint default 0,
  source text default '',
  note text default '',
  updated_at bigint
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('thu','chi')),
  date date not null,
  client_id text references public.clients(id) on update cascade on delete restrict,
  category text default '',
  amount bigint not null check (amount >= 0),
  note text default '',
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at bigint,
  updated_at bigint
);
create index if not exists entries_date_idx on public.entries(date desc);
create index if not exists entries_client_idx on public.entries(client_id);

-- Chỉ người đã đăng nhập (tài khoản do quản trị viên tạo) mới đọc/ghi được
alter table public.clients enable row level security;
alter table public.entries enable row level security;

drop policy if exists "team all clients" on public.clients;
create policy "team all clients" on public.clients for all to authenticated using (true) with check (true);
drop policy if exists "team all entries" on public.entries;
create policy "team all entries" on public.entries for all to authenticated using (true) with check (true);

-- Cập nhật realtime: máy người này ghi, máy người kia tự hiện
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.clients'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.entries'; exception when others then null; end;
end $$;

-- ===== Nâng cấp lần 2 (đã gộp sẵn cho cài mới) =====

alter table public.clients add column if not exists role text default '';
alter table public.clients add column if not exists zalo text default '';
alter table public.clients add column if not exists region text default '';
alter table public.clients add column if not exists address text default '';
alter table public.clients add column if not exists priority text default '';
alter table public.clients add column if not exists signed_date date;
alter table public.clients add column if not exists next_action text default '';
alter table public.clients add column if not exists next_date date;
alter table public.clients add column if not exists last_contact date;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on update cascade on delete cascade,
  date date not null,
  channel text default '',
  content text default '',
  result text default '',
  next_date date,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at bigint
);
create index if not exists activities_client_idx on public.activities(client_id);
create index if not exists activities_date_idx on public.activities(date desc);

alter table public.activities enable row level security;
drop policy if exists "team all activities" on public.activities;
create policy "team all activities" on public.activities for all to authenticated using (true) with check (true);

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.activities'; exception when others then null; end;
end $$;

-- ===== Nâng cấp lần 3 =====
alter table public.clients add column if not exists journey jsonb default '[]'::jsonb;

-- ===== Nâng cấp lần 4 =====

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id text references public.clients(id) on update cascade on delete cascade,
  category text default 'Khác',
  name text not null,
  path text not null unique,
  size bigint default 0,
  mime text default '',
  note text default '',
  doc_date date,
  created_by_email text default (auth.jwt() ->> 'email'),
  created_at bigint
);
create index if not exists documents_client_idx on public.documents(client_id);
alter table public.documents enable row level security;
drop policy if exists "team all documents" on public.documents;
create policy "team all documents" on public.documents for all to authenticated using (true) with check (true);

-- Kho file riêng tư (không công khai), mỗi file tối đa 50 MB
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "hpg docs read" on storage.objects;
create policy "hpg docs read" on storage.objects for select to authenticated using (bucket_id = 'documents');
drop policy if exists "hpg docs insert" on storage.objects;
create policy "hpg docs insert" on storage.objects for insert to authenticated with check (bucket_id = 'documents');
drop policy if exists "hpg docs update" on storage.objects;
create policy "hpg docs update" on storage.objects for update to authenticated using (bucket_id = 'documents');
drop policy if exists "hpg docs delete" on storage.objects;
create policy "hpg docs delete" on storage.objects for delete to authenticated using (bucket_id = 'documents');

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.documents'; exception when others then null; end;
end $$;

-- ===== Nâng cấp lần 5 =====
alter table public.entries add column if not exists method text default '';
alter table public.entries add column if not exists installment int default 0;
alter table public.entries add column if not exists tax bigint default 0;
