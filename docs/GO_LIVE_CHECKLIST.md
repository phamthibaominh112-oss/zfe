# Go-live checklist

## Security

- [ ] Public sign-up đã tắt.
- [ ] Admin đầu tiên đã được bootstrap và kiểm tra role.
- [ ] Service role key chỉ tồn tại trong Vercel server environment.
- [ ] RLS migration đã chạy thành công.
- [ ] Đã test 5 user thật, mỗi role một tài khoản.
- [ ] Teacher truy cập `/finance` bị redirect và query tuition trả về 0 row.
- [ ] CSKH query attendance/results/observations trả về 0 row.
- [ ] Student A không đọc được student B, enrollment B hoặc tuition B.
- [ ] Role thường không DELETE được record.

## Operations

- [ ] Program, level và course template đã chuẩn hoá.
- [ ] Mã lớp/mã học viên không trùng.
- [ ] Teacher profile đã liên kết đúng `auth.users`.
- [ ] Student portal account đã liên kết đúng student profile.
- [ ] Lịch rảnh và session timezone được thống nhất theo Asia/Ho_Chi_Minh.
- [ ] Quy định Completed/Cancelled/Make-up đã thống nhất trước khi tính payroll.

## Finance

- [ ] Opening balance đã đối soát.
- [ ] Mỗi lần thu tiền là một payment transaction, không sửa tổng thủ công.
- [ ] Renewal due date có owner và quy trình follow-up.

## Reliability

- [ ] Supabase backup/PITR được bật theo gói sử dụng.
- [ ] Custom SMTP đã test.
- [ ] Domain production và redirect URL đã test.
- [ ] GitHub branch protection và CI đã bật.
- [ ] Có người chịu trách nhiệm duyệt migration trước khi chạy production.
