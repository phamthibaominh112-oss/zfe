# Update ZE CenterOS v1.1.1

1. Copy toàn bộ file trong hotfix vào root repository và chọn ghi đè.
2. Commit/push lên nhánh `main` để Vercel deploy source mới.
3. Trong Supabase SQL Editor, chạy:
   `supabase/migrations/004_schedule_management.sql`
4. Đăng nhập bằng Admin hoặc Quản lý học vụ → Lịch trung tâm.

Không cần import lại CSV, tạo lại user hoặc thay environment variables.
