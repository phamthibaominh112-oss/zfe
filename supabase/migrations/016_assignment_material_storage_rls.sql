-- ZE CenterOS v1.5.5
-- Fix Storage RLS for teacher homework materials under the session-first model.

begin;

drop policy if exists assignment_materials_insert on storage.objects;
create policy assignment_materials_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'assignment-materials'
  and exists (
    select 1
    from public.assignments a
    where a.id = ((storage.foldername(name))[1])::uuid
      and (
        public.current_role() in ('admin','academic_manager')
        or (
          public.current_role() = 'teacher'
          and public.teacher_operates_class(a.class_id)
          and (a.session_id is null or public.teacher_has_session(a.session_id))
        )
      )
  )
);

drop policy if exists assignment_materials_select on storage.objects;
create policy assignment_materials_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'assignment-materials'
  and exists (
    select 1
    from public.assignments a
    where a.id = ((storage.foldername(name))[1])::uuid
      and (
        public.current_role() in ('admin','academic_manager')
        or (
          public.current_role() = 'teacher'
          and public.teacher_operates_class(a.class_id)
        )
        or public.student_in_class(a.class_id)
      )
  )
);

drop policy if exists assignment_materials_update on storage.objects;
create policy assignment_materials_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'assignment-materials'
  and exists (
    select 1
    from public.assignments a
    where a.id = ((storage.foldername(name))[1])::uuid
      and (
        public.current_role() in ('admin','academic_manager')
        or (
          public.current_role() = 'teacher'
          and public.teacher_operates_class(a.class_id)
          and (a.session_id is null or public.teacher_has_session(a.session_id))
        )
      )
  )
)
with check (
  bucket_id = 'assignment-materials'
  and exists (
    select 1
    from public.assignments a
    where a.id = ((storage.foldername(name))[1])::uuid
      and (
        public.current_role() in ('admin','academic_manager')
        or (
          public.current_role() = 'teacher'
          and public.teacher_operates_class(a.class_id)
          and (a.session_id is null or public.teacher_has_session(a.session_id))
        )
      )
  )
);

drop policy if exists assignment_materials_delete on storage.objects;
create policy assignment_materials_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'assignment-materials'
  and exists (
    select 1
    from public.assignments a
    where a.id = ((storage.foldername(name))[1])::uuid
      and (
        public.current_role() in ('admin','academic_manager')
        or (
          public.current_role() = 'teacher'
          and public.teacher_operates_class(a.class_id)
          and (a.session_id is null or public.teacher_has_session(a.session_id))
        )
      )
  )
);

commit;
