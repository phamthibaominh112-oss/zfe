# ZE CenterOS v1.1.0 — Role-first UI

Không thay đổi database schema hoặc RLS.

## Thay đổi chính

- Dashboard riêng theo từng role, ưu tiên lịch hôm nay, lịch tuần và việc cần xử lý.
- Sidebar được sắp xếp lại theo công việc thực tế của từng role.
- Loại bỏ các nội dung kỹ thuật như Supabase, RLS, database và SQL khỏi giao diện vận hành.
- Lịch tuần trở thành nội dung chính; matching và availability được đưa vào khu vực công cụ mở rộng.
- Student dashboard ưu tiên buổi học tiếp theo, tiến độ lớp, giáo viên, bài tập và học phí.
- Teacher dashboard ưu tiên lịch dạy, điểm danh, workload, feedback và học viên của lớp.
- Academic/Admin dashboard ưu tiên lịch trung tâm, học viên chờ lớp và feedback chờ duyệt.
- CSKH dashboard ưu tiên follow-up, tái phí, công nợ và học viên chờ xếp lớp.
- Các status thông dụng được hiển thị bằng tiếng Việt.

## Triển khai

Ghi đè các file của hotfix lên repository hiện tại, commit vào `main` và chờ Vercel deploy tự động. Không cần chạy thêm SQL.
