# ZE CenterOS v1.0.5 — Student Portal Data Visibility Fix

## Fixed

- Student dashboard no longer looks empty when the only enrolled class is historical/completed.
- Added recent session history for the logged-in student.
- Active and completed enrollments are counted separately.
- Fixed class progress query (`class_progress.id`, not the non-existent `class_id`).
- Weekly calendar now resolves the current week using `Asia/Ho_Chi_Minh`, avoiding the previous-week display during early Vietnam mornings.
- Student navigation labels now read `Lịch học` and `Học phí`.
- Empty states explain which data was absent from the source workbook instead of implying an import failure.

## Data note

Hồng Minh's imported legacy class contains six sessions from 06/05/2026 to 13/06/2026: three Completed and three Cancelled. There are no imported assignments, published feedback, attendance records, or tuition transactions because the source workbook did not contain those records.
