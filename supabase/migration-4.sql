-- HPG CRM — nâng cấp lần 4: Kho tài liệu (ảnh, bản scan hợp đồng, chứng từ, giấy phép)
-- Chạy 1 lần trong Supabase → SQL Editor → New query → dán toàn bộ → Run. Chạy lại cũng không sao.

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
