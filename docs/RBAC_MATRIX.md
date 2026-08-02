# RBAC Matrix

| Module | Admin | Quản lý học vụ | Giáo viên | CSKH | Học viên |
|---|---:|---:|---:|---:|---:|
| User & role management | Full | No | No | No | No |
| Student master profile | Full | Add/Edit | Assigned students, read | Add/Edit | Own profile, read |
| Classes | Full | Add/Edit | Assigned classes | Basic operational view | Enrolled classes |
| Teacher availability | Full | View/Manage | Own Add/Edit | No | No |
| Student availability | Full | Add/Edit | No | Add/Edit | Own read |
| Sessions | Full | Add/Edit/Reschedule | Assigned session read/complete | No | Enrolled session read |
| Attendance/Homework | Full | Add/Edit | Assigned session Add/Edit | No | Own read |
| Assignment/Submission | Full | Full | Assigned classes | No | Own submit/read |
| Assessment & results | Full | Full | Assigned classes | No | Own published results |
| Progress feedback | Full | Approve/Publish | Assigned students submit/revise | No | Own published feedback |
| Observation | Full | Create/Share | Own shared results | No | No |
| Raw student ratings | Full | Read | No | No | Own create/update |
| Tuition/Payment/Renewal | Full | No | No | Add/Edit | Own read |
| Audit logs | Full | No | No | No | No |
| Delete | Full | No | No | No | No |

RLS trong `supabase/migrations/002_rls.sql` là nguồn kiểm soát cuối cùng. Menu ẩn không được xem là biện pháp bảo mật.
