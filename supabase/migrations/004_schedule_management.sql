-- ZE CenterOS v1.1.1
-- Allow Admin and Academic Manager to manage teacher availability
-- and replace/remove teacher assignments while rescheduling sessions.

begin;

-- Academic Manager can remove an incorrect/outdated teacher availability slot.
drop policy if exists teacher_availability_delete on public.teacher_availability;
create policy teacher_availability_delete
on public.teacher_availability
for delete
to authenticated
using (public.is_academic_manager());

-- Academic Manager can replace the main teacher of a session.
-- This policy only controls the join row. The session itself remains protected
-- by the existing sessions update policy and is archived rather than hard-deleted.
drop policy if exists session_teachers_delete on public.session_teachers;
create policy session_teachers_delete
on public.session_teachers
for delete
to authenticated
using (public.is_academic_manager());

commit;
