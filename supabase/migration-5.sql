-- HPG CRM — nâng cấp lần 5: Sổ thu chi theo mẫu (hình thức thanh toán, đợt, thuế)
-- Chạy 1 lần trong Supabase → SQL Editor → New query → dán toàn bộ → Run. Chạy lại cũng không sao.
alter table public.entries add column if not exists method text default '';
alter table public.entries add column if not exists installment int default 0;
alter table public.entries add column if not exists tax bigint default 0;
