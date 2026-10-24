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
