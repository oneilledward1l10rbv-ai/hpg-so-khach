# HPG CRM

HPG CRM: web quản lý khách hàng, thu chi và dashboard cho dịch vụ pháp lý y tế & marketing của H&P Group: ghi thu/chi theo từng khách, tự tính chi phí, lợi nhuận, biên lợi nhuận và công nợ còn phải thu. Có đăng nhập bằng email + mật khẩu, nhiều người dùng chung, dữ liệu cập nhật tức thì.

- Giao diện: 1 file `index.html`, chạy trên **GitHub Pages** (miễn phí)
- Dữ liệu + đăng nhập: **Supabase** (gói miễn phí)

## Cài đặt (làm 1 lần, khoảng 15 phút)

### 1. Tạo cơ sở dữ liệu Supabase
1. Vào https://supabase.com → đăng nhập bằng GitHub → **New project**. Đặt tên `hpg-so-khach`, chọn vùng **Singapore**, đặt mật khẩu database (lưu lại).
2. Khi project tạo xong: menu trái **SQL Editor** → **New query** → dán toàn bộ nội dung file `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: tắt **Allow new users to sign up** (chỉ quản trị viên tạo tài khoản). Có thể tắt luôn **Confirm email**.
4. **Authentication → Users → Add user → Create new user**: tạo tài khoản cho mình và từng nhân viên (email + mật khẩu), tick **Auto Confirm User**.
5. **Project Settings → API**: copy **Project URL** và **anon public key**.

### 1b. Đã cài từ trước? Chạy nâng cấp
Nếu cơ sở dữ liệu tạo trước ngày 24/10/2026: SQL Editor → New query → dán `supabase/migration-2.sql` → Run (thêm Nhật ký chăm sóc, Việc cần làm, các trường khách mới).

### 2. Điền cấu hình
Mở file `config.js` trên GitHub (bấm biểu tượng bút chì), thay `DIEN_SUPABASE_URL` và `DIEN_SUPABASE_ANON_KEY` bằng 2 giá trị vừa copy → **Commit changes**.

### 3. Bật GitHub Pages
Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → **Save**. Sau 1–2 phút web chạy tại:

`https://sokhach.hpgrp.vn` (tên miền riêng; bản gốc vẫn ở https://oneilledward1l10rbv-ai.github.io/hpg-so-khach/)

### 4. Đưa danh sách khách vào
Đăng nhập → tab **Nhập / xuất file** → tải sheet *Khách hàng* từ Google Sheets dạng CSV và kéo vào.

## Bảo mật
- Repo công khai chỉ chứa code, **không chứa dữ liệu khách**. Dữ liệu nằm trong Supabase, chỉ người đã đăng nhập mới đọc được (Row Level Security).
- Anon key được Supabase thiết kế để nằm ở trình duyệt, không phải bí mật. **Không bao giờ** dán `service_role` key vào đây.
- Thêm/xoá nhân viên: Supabase → Authentication → Users.
