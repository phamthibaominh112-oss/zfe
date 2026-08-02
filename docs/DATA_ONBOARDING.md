# Data onboarding

Thứ tự nhập dữ liệu thật:

1. Programs → Levels → Course Templates.
2. Tạo user cho Admin, Academic Manager, Teacher, CSKH.
3. Liên kết Teacher profile với user.
4. Import/tạo Student master profile.
5. Tạo Classes.
6. Assign teachers.
7. Tạo Enrollments.
8. Tạo recurring/individual availability.
9. Tạo Sessions.
10. Tạo Tuition Accounts rồi ghi từng Payment Transaction.

Không import session bằng “date range + weekday” vào một record. Mỗi buổi học phải là một row riêng trong `sessions` để attendance, homework, assignment, payroll và audit hoạt động đúng.

Đối với dữ liệu Excel hiện tại, nên làm migration script có bước staging và validation trước khi insert production. Không upload trực tiếp file Excel vào table chính nếu chưa kiểm tra duplicate class code, student code, email, session number và time conflict.
