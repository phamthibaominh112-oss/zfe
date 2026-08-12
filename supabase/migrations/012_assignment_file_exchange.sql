-- ZE CenterOS v1.4.5
-- Two-way Assignment File Exchange
-- Teacher uploads source/homework material -> student downloads -> student uploads submission.

begin;

alter table public.assignments
  add column if not exists material_path text,
  add column if not exists material_name text,
  add column if not exists material_mime text,
  add column if not exists material_size bigint;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'assignment-materials',
  'assignment-materials',
  false,
  20971520,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip'
  ]
)
on conflict(id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Also expand student submission bucket to the same practical classroom formats.
update storage.buckets
set file_size_limit=20971520,
    allowed_mime_types=array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip'
    ]
where id='assignment-files';

drop policy if exists assignment_materials_insert on storage.objects;
create policy assignment_materials_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='assignment-materials'
  and exists(
    select 1
    from public.assignments a
    where a.id=((storage.foldername(name))[1])::uuid
      and (
        public.is_academic_manager()
        or (public.current_role()='teacher' and public.teacher_has_class(a.class_id))
      )
  )
);

drop policy if exists assignment_materials_select on storage.objects;
create policy assignment_materials_select on storage.objects
for select to authenticated
using (
  bucket_id='assignment-materials'
  and exists(
    select 1
    from public.assignments a
    where a.id=((storage.foldername(name))[1])::uuid
      and public.can_view_assignment(a.id)
  )
);

drop policy if exists assignment_materials_update on storage.objects;
create policy assignment_materials_update on storage.objects
for update to authenticated
using (
  bucket_id='assignment-materials'
  and exists(
    select 1
    from public.assignments a
    where a.id=((storage.foldername(name))[1])::uuid
      and (
        public.is_academic_manager()
        or (public.current_role()='teacher' and public.teacher_has_class(a.class_id))
      )
  )
)
with check (
  bucket_id='assignment-materials'
  and exists(
    select 1
    from public.assignments a
    where a.id=((storage.foldername(name))[1])::uuid
      and (
        public.is_academic_manager()
        or (public.current_role()='teacher' and public.teacher_has_class(a.class_id))
      )
  )
);

drop policy if exists assignment_materials_delete on storage.objects;
create policy assignment_materials_delete on storage.objects
for delete to authenticated
using (
  bucket_id='assignment-materials'
  and (
    public.is_admin()
    or exists(
      select 1
      from public.assignments a
      where a.id=((storage.foldername(name))[1])::uuid
        and (
          public.is_academic_manager()
          or (public.current_role()='teacher' and public.teacher_has_class(a.class_id))
        )
    )
  )
);

commit;
