-- HPG CRM — nâng cấp lần 6: lưu link Google Drive cho tài liệu, thư mục Drive cho từng khách
-- Chạy 1 lần trong Supabase → SQL Editor → New query → dán toàn bộ → Run. Chạy lại cũng không sao.
alter table public.documents add column if not exists url text default '';
alter table public.documents alter column path drop not null;
alter table public.clients add column if not exists drive_url text default '';
