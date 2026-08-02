-- Verify Auth accounts, roles, and teacher/student links after bulk creation.
select
  u.email,
  p.full_name,
  p.role,
  p.is_active,
  t.code as teacher_code,
  s.code as student_code
from auth.users u
left join public.profiles p on p.id = u.id
left join public.teachers t on t.user_id = u.id
left join public.students s on s.user_id = u.id
where p.role in ('teacher'::public.app_role, 'student'::public.app_role)
order by p.role, p.full_name;

-- Unlinked operational records that still need an Auth account.
select 'teacher' as entity_type, code, full_name, email
from public.teachers
where archived_at is null and user_id is null
union all
select 'student', code, full_name, email
from public.students
where archived_at is null and user_id is null
order by entity_type, full_name;
