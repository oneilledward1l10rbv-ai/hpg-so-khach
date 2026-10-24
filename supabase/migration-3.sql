-- HPG CRM — nâng cấp lần 3: Hành trình hồ sơ (các bước triển khai sau khi ký hợp đồng)
-- Chạy 1 lần trong Supabase → SQL Editor → New query → dán toàn bộ → Run. Chạy lại cũng không sao.
alter table public.clients add column if not exists journey jsonb default '[]'::jsonb;
