# ZE CenterOS v1.1.1 — Schedule Management

Bản cập nhật bổ sung quyền cho **Admin** và **Quản lý học vụ**:

- Điều chỉnh ngày, giờ, hình thức, phòng, link, nội dung và trạng thái của session.
- Thay đổi hoặc gỡ Giáo viên chính của một session.
- Xóa session khỏi lịch hiển thị bằng cơ chế archive để giữ lịch sử vận hành.
- Điều chỉnh hoặc xóa lịch rảnh Giáo viên.
- Mọi lần điều chỉnh/xóa session đều lưu lý do vào `session_changes`.

## Sau khi cập nhật source

Chạy file sau trong Supabase SQL Editor:

```text
supabase/migrations/004_schedule_management.sql
```

Không cần import lại dữ liệu hoặc tạo lại tài khoản.
