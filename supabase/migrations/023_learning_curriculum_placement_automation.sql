-- ZE CenterOS v2.0.0
-- Student Learning Hub + Curriculum/Syllabus + Placement Form Automation

begin;

-- ---------------------------------------------------------------------
-- Placement: separate full-test owner from Speaking assessor.
-- ---------------------------------------------------------------------
alter table public.placement_tests
  add column if not exists assigned_teacher_id uuid references public.teachers(id) on delete set null,
  add column if not exists google_form_url text,
  add column if not exists external_token text,
  add column if not exists google_form_response_id text,
  add column if not exists objective_auto_score numeric(8,2),
  add column if not exists objective_max_score numeric(8,2),
  add column if not exists form_completed_at timestamptz,
  add column if not exists auto_scored_at timestamptz;

update public.placement_tests
set google_form_url=coalesce(google_form_url,'https://docs.google.com/forms/d/e/1FAIpQLSeomhHBjnWulq0oeOEVz55jI36LJJaQJrDDyzgHAacUFWHYPw/viewform?usp=send_form')
where google_form_url is null;

update public.placement_tests
set external_token='PT-'||upper(substr(replace(id::text,'-',''),1,10))
where external_token is null;

alter table public.placement_tests alter column external_token set not null;
create unique index if not exists uq_placement_external_token on public.placement_tests(external_token);
create index if not exists idx_placement_assigned_teacher on public.placement_tests(assigned_teacher_id,scheduled_start);

create table if not exists public.placement_form_submissions (
  id uuid primary key default gen_random_uuid(),
  placement_test_id uuid references public.placement_tests(id) on delete cascade,
  external_token text not null,
  response_id text,
  objective_score numeric(8,2),
  max_score numeric(8,2),
  answers jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create unique index if not exists uq_placement_form_response_id
  on public.placement_form_submissions(response_id)
  where response_id is not null;
create index if not exists idx_placement_form_token on public.placement_form_submissions(external_token,submitted_at desc);

create or replace function public.teacher_assigned_placement_test(p_placement_test_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.placement_tests pt
    where pt.id=p_placement_test_id
      and pt.assigned_teacher_id=public.current_teacher_id()
  )
  or exists(
    select 1 from public.placement_speaking_bookings psb
    where psb.placement_test_id=p_placement_test_id
      and psb.teacher_id=public.current_teacher_id()
  )
$$;

drop policy if exists placement_tests_select on public.placement_tests;
create policy placement_tests_select on public.placement_tests
for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_assigned_placement_test(id)
  or student_id=public.current_student_id()
);

drop policy if exists placement_tests_update on public.placement_tests;
create policy placement_tests_update on public.placement_tests
for update to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or assigned_teacher_id=public.current_teacher_id()
) with check (
  public.current_role() in ('admin','academic_manager','customer_service')
  or assigned_teacher_id=public.current_teacher_id()
);

alter table public.placement_form_submissions enable row level security;
drop policy if exists placement_form_submissions_select on public.placement_form_submissions;
create policy placement_form_submissions_select on public.placement_form_submissions
for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or exists(
    select 1 from public.placement_tests pt
    where pt.id=placement_test_id
      and (pt.assigned_teacher_id=public.current_teacher_id() or pt.student_id=public.current_student_id())
  )
);

-- ---------------------------------------------------------------------
-- Curriculum / syllabus master.
-- ---------------------------------------------------------------------
create table if not exists public.syllabus_templates (
  id uuid primary key default gen_random_uuid(),
  course_template_id uuid references public.course_templates(id) on delete set null,
  code text unique not null,
  name text not null,
  description text,
  version integer not null default 1 check(version>0),
  status text not null default 'Draft' check(status in ('Draft','Active','Archived')),
  outline_file_path text,
  outline_file_name text,
  outline_file_mime text,
  outline_file_size bigint,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.syllabus_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.syllabus_templates(id) on delete cascade,
  session_no integer not null check(session_no>0),
  title text not null,
  learning_objectives text,
  content text,
  homework text,
  slide_url text,
  material_file_path text,
  material_file_name text,
  material_file_mime text,
  material_file_size bigint,
  duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id,session_no)
);

create table if not exists public.class_syllabus_items (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  session_no integer not null check(session_no>0),
  source_template_id uuid references public.syllabus_templates(id) on delete set null,
  source_template_item_id uuid references public.syllabus_template_items(id) on delete set null,
  title text not null,
  learning_objectives text,
  content text,
  homework text,
  slide_url text,
  material_file_path text,
  material_file_name text,
  material_file_mime text,
  material_file_size bigint,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_id,session_no)
);
create index if not exists idx_class_syllabus_class_session on public.class_syllabus_items(class_id,session_no);

-- ---------------------------------------------------------------------
-- Learning recommendations: staff -> teaching team / learner.
-- ---------------------------------------------------------------------
create table if not exists public.student_learning_recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  teacher_id uuid references public.teachers(id) on delete set null,
  category text not null default 'Academic' check(category in ('Academic','Attendance','Homework','Midterm','Final','Placement','Retention','Other')),
  priority text not null default 'Medium' check(priority in ('Low','Medium','High')),
  title text not null,
  recommendation text not null,
  evidence text,
  visible_to_student boolean not null default false,
  status text not null default 'Open' check(status in ('Open','Acknowledged','Done','Archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  completed_at timestamptz
);
create index if not exists idx_learning_recommendations_student on public.student_learning_recommendations(student_id,created_at desc);
create index if not exists idx_learning_recommendations_teacher on public.student_learning_recommendations(teacher_id,status);

-- ---------------------------------------------------------------------
-- RLS: Academic data input is now also available to CSKH as explicitly
-- requested for the learner record workflow.
-- ---------------------------------------------------------------------
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_has_session(session_id)
  or student_id=public.current_student_id()
);
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated with check (
  (
    public.current_role() in ('admin','academic_manager','customer_service')
    or public.teacher_has_session(session_id)
  )
  and public.student_belongs_to_session(student_id,session_id)
);
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_has_session(session_id)
) with check (
  (
    public.current_role() in ('admin','academic_manager','customer_service')
    or public.teacher_has_session(session_id)
  )
  and public.student_belongs_to_session(student_id,session_id)
);

drop policy if exists homework_records_select on public.homework_records;
create policy homework_records_select on public.homework_records for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_has_session(session_id)
  or student_id=public.current_student_id()
);
drop policy if exists homework_records_insert on public.homework_records;
create policy homework_records_insert on public.homework_records for insert to authenticated with check (
  (
    public.current_role() in ('admin','academic_manager','customer_service')
    or public.teacher_has_session(session_id)
  )
  and public.student_belongs_to_session(student_id,session_id)
);
drop policy if exists homework_records_update on public.homework_records;
create policy homework_records_update on public.homework_records for update to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_has_session(session_id)
) with check (
  (
    public.current_role() in ('admin','academic_manager','customer_service')
    or public.teacher_has_session(session_id)
  )
  and public.student_belongs_to_session(student_id,session_id)
);

drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_operates_class(class_id)
  or public.student_in_class(class_id)
);
drop policy if exists assessments_insert on public.assessments;
create policy assessments_insert on public.assessments for insert to authenticated with check (
  public.current_role() in ('admin','academic_manager','customer_service')
  or (public.current_role()='teacher' and public.teacher_operates_class(class_id))
);
drop policy if exists assessments_update on public.assessments;
create policy assessments_update on public.assessments for update to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or (public.current_role()='teacher' and public.teacher_operates_class(class_id))
) with check (
  public.current_role() in ('admin','academic_manager','customer_service')
  or (public.current_role()='teacher' and public.teacher_operates_class(class_id))
);

drop policy if exists assessment_results_select on public.assessment_results;
create policy assessment_results_select on public.assessment_results for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or exists(select 1 from public.assessments a where a.id=assessment_id and public.teacher_operates_class(a.class_id))
  or student_id=public.current_student_id()
);
drop policy if exists assessment_results_insert on public.assessment_results;
create policy assessment_results_insert on public.assessment_results for insert to authenticated with check (
  public.current_role() in ('admin','academic_manager','customer_service')
  or exists(select 1 from public.assessments a where a.id=assessment_id and public.teacher_operates_class(a.class_id))
);
drop policy if exists assessment_results_update on public.assessment_results;
create policy assessment_results_update on public.assessment_results for update to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or exists(select 1 from public.assessments a where a.id=assessment_id and public.teacher_operates_class(a.class_id))
) with check (
  public.current_role() in ('admin','academic_manager','customer_service')
  or exists(select 1 from public.assessments a where a.id=assessment_id and public.teacher_operates_class(a.class_id))
);

alter table public.syllabus_templates enable row level security;
alter table public.syllabus_template_items enable row level security;
alter table public.class_syllabus_items enable row level security;
alter table public.student_learning_recommendations enable row level security;

drop policy if exists syllabus_templates_select on public.syllabus_templates;
create policy syllabus_templates_select on public.syllabus_templates for select to authenticated using (true);
drop policy if exists syllabus_templates_write on public.syllabus_templates;
create policy syllabus_templates_write on public.syllabus_templates for all to authenticated
using (public.current_role() in ('admin','academic_manager'))
with check (public.current_role() in ('admin','academic_manager'));

drop policy if exists syllabus_template_items_select on public.syllabus_template_items;
create policy syllabus_template_items_select on public.syllabus_template_items for select to authenticated using (true);
drop policy if exists syllabus_template_items_write on public.syllabus_template_items;
create policy syllabus_template_items_write on public.syllabus_template_items for all to authenticated
using (public.current_role() in ('admin','academic_manager'))
with check (public.current_role() in ('admin','academic_manager'));

drop policy if exists class_syllabus_select on public.class_syllabus_items;
create policy class_syllabus_select on public.class_syllabus_items for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_operates_class(class_id)
  or public.student_in_class(class_id)
);
drop policy if exists class_syllabus_write on public.class_syllabus_items;
create policy class_syllabus_write on public.class_syllabus_items for all to authenticated
using (public.current_role() in ('admin','academic_manager'))
with check (public.current_role() in ('admin','academic_manager'));

drop policy if exists learning_recommendations_select on public.student_learning_recommendations;
create policy learning_recommendations_select on public.student_learning_recommendations for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or teacher_id=public.current_teacher_id()
  or (
    student_id=public.current_student_id()
    and visible_to_student=true
  )
);
drop policy if exists learning_recommendations_insert on public.student_learning_recommendations;
create policy learning_recommendations_insert on public.student_learning_recommendations for insert to authenticated with check (
  public.current_role() in ('admin','academic_manager','customer_service','teacher')
);
drop policy if exists learning_recommendations_update on public.student_learning_recommendations;
create policy learning_recommendations_update on public.student_learning_recommendations for update to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or teacher_id=public.current_teacher_id()
) with check (
  public.current_role() in ('admin','academic_manager','customer_service')
  or teacher_id=public.current_teacher_id()
);
drop policy if exists learning_recommendations_delete on public.student_learning_recommendations;
create policy learning_recommendations_delete on public.student_learning_recommendations for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Private course materials bucket. All authenticated users may read
-- because RLS on syllabus rows already controls what links the UI exposes.
-- Only Admin/Academic may write.
-- ---------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit)
values('course-materials','course-materials',false,31457280)
on conflict(id) do update set file_size_limit=31457280;

drop policy if exists course_materials_select on storage.objects;
create policy course_materials_select on storage.objects for select to authenticated
using(bucket_id='course-materials');

drop policy if exists course_materials_insert on storage.objects;
create policy course_materials_insert on storage.objects for insert to authenticated
with check(bucket_id='course-materials' and public.current_role() in ('admin','academic_manager'));

drop policy if exists course_materials_update on storage.objects;
create policy course_materials_update on storage.objects for update to authenticated
using(bucket_id='course-materials' and public.current_role() in ('admin','academic_manager'))
with check(bucket_id='course-materials' and public.current_role() in ('admin','academic_manager'));

drop policy if exists course_materials_delete on storage.objects;
create policy course_materials_delete on storage.objects for delete to authenticated
using(bucket_id='course-materials' and public.current_role() in ('admin','academic_manager'));

commit;
