-- ZE CenterOS v1.5.4
-- Fix RLS for the current class-first + session-teacher operating model.
--
-- Problem:
-- Legacy policies only considered class_teachers when deciding whether a Teacher
-- could see a class roster or create an Assignment.
-- CenterOS now allows a teacher to be assigned directly to a specific session,
-- so a valid session teacher could see the session but receive:
--   - zero enrollment/student roster rows
--   - RLS violation when creating an assignment for that session
--
-- This migration allows direct session assignments without changing payroll.

begin;

-- A teacher is operationally connected to a class if they are either:
-- 1. attached at class level; OR
-- 2. assigned to at least one active session of that class.
create or replace function public.teacher_operates_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select
    public.teacher_has_class(p_class_id)
    or exists(
      select 1
      from public.sessions s
      join public.session_teachers st on st.session_id=s.id
      where s.class_id=p_class_id
        and st.teacher_id=public.current_teacher_id()
        and s.archived_at is null
    )
$$;

-- Student visibility must follow the same operational model, otherwise nested
-- students(...) inside enrollment roster queries returns empty/null for a direct
-- session teacher.
create or replace function public.teacher_can_view_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.enrollments e
    where e.student_id=p_student_id
      and e.archived_at is null
      and public.teacher_operates_class(e.class_id)
  )
$$;

-- Enrollment roster: allow the teacher currently operating the class through
-- either class-level or direct session assignment.
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select
on public.enrollments
for select
to authenticated
using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_operates_class(class_id)
  or student_id=public.current_student_id()
);

-- Assignment INSERT/UPDATE:
-- Academic/Admin always allowed.
-- Teacher allowed if they operate the class.
-- If a session_id is provided, the teacher must also be assigned to that
-- specific session. This prevents a one-off session teacher from attaching an
-- assignment to a different session in the same class.
drop policy if exists assignments_insert on public.assignments;
create policy assignments_insert
on public.assignments
for insert
to authenticated
with check (
  public.is_academic_manager()
  or (
    public.current_role()='teacher'
    and public.teacher_operates_class(class_id)
    and (
      session_id is null
      or public.teacher_has_session(session_id)
    )
  )
);

drop policy if exists assignments_update on public.assignments;
create policy assignments_update
on public.assignments
for update
to authenticated
using (
  public.is_academic_manager()
  or (
    public.current_role()='teacher'
    and public.teacher_operates_class(class_id)
    and (
      session_id is null
      or public.teacher_has_session(session_id)
    )
  )
)
with check (
  public.is_academic_manager()
  or (
    public.current_role()='teacher'
    and public.teacher_operates_class(class_id)
    and (
      session_id is null
      or public.teacher_has_session(session_id)
    )
  )
);

-- Assessments use the same operational class model so direct session teachers
-- do not hit the same mismatch later.
drop policy if exists assessments_select on public.assessments;
create policy assessments_select
on public.assessments
for select
to authenticated
using (
  public.is_academic_manager()
  or public.teacher_operates_class(class_id)
  or public.student_in_class(class_id)
);

drop policy if exists assessments_insert on public.assessments;
create policy assessments_insert
on public.assessments
for insert
to authenticated
with check (
  public.is_academic_manager()
  or (
    public.current_role()='teacher'
    and public.teacher_operates_class(class_id)
  )
);

drop policy if exists assessments_update on public.assessments;
create policy assessments_update
on public.assessments
for update
to authenticated
using (
  public.is_academic_manager()
  or (
    public.current_role()='teacher'
    and public.teacher_operates_class(class_id)
  )
)
with check (
  public.is_academic_manager()
  or (
    public.current_role()='teacher'
    and public.teacher_operates_class(class_id)
  )
);

commit;
