-- HPG CRM — nâng cấp lần 7: Nhãn chăm sóc (Đã gọi, Đã kết nối Zalo, Đã hẹn gặp…)
-- Chạy 1 lần trong Supabase → SQL Editor → New query → dán → Run. Chạy lại cũng không sao.
alter table public.clients add column if not exists tags jsonb default '[]'::jsonb;
