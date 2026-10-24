-- HPG CRM — nâng cấp lần 2: thêm trường khách hàng + nhật ký chăm sóc
-- Chạy 1 lần trong Supabase → SQL Editor → New query → dán toàn bộ → Run. Chạy lại cũng không sao.

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
