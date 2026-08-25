begin;

alter table public.expense_transactions
  add column if not exists receipt_path text,
  add column if not exists receipt_name text,
  add column if not exists receipt_mime text,
  add column if not exists receipt_size bigint;

insert into storage.buckets(id,name,public,file_size_limit)
values('expense-documents','expense-documents',false,20971520)
on conflict(id) do update set file_size_limit=20971520;

drop policy if exists expense_documents_select on storage.objects;
create policy expense_documents_select on storage.objects for select to authenticated
using(bucket_id='expense-documents' and public.current_role() in ('admin','customer_service'));
drop policy if exists expense_documents_insert on storage.objects;
create policy expense_documents_insert on storage.objects for insert to authenticated
with check(bucket_id='expense-documents' and public.current_role() in ('admin','customer_service'));
drop policy if exists expense_documents_update on storage.objects;
create policy expense_documents_update on storage.objects for update to authenticated
using(bucket_id='expense-documents' and public.current_role() in ('admin','customer_service'))
with check(bucket_id='expense-documents' and public.current_role() in ('admin','customer_service'));
drop policy if exists expense_documents_delete on storage.objects;
create policy expense_documents_delete on storage.objects for delete to authenticated
using(bucket_id='expense-documents' and public.current_role()='admin');

drop policy if exists expenses_admin_select on public.expense_transactions;
drop policy if exists expenses_admin_insert on public.expense_transactions;
drop policy if exists expenses_admin_update on public.expense_transactions;
create policy expenses_staff_select on public.expense_transactions for select to authenticated using (public.current_role() in ('admin','customer_service'));
create policy expenses_staff_insert on public.expense_transactions for insert to authenticated with check (public.current_role() in ('admin','customer_service'));
create policy expenses_staff_update on public.expense_transactions for update to authenticated using (public.current_role() in ('admin','customer_service')) with check (public.current_role() in ('admin','customer_service'));

create table if not exists public.student_care_feedback (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  cycle_type text not null check(cycle_type in ('First week','Monthly')),
  cycle_no integer not null default 0 check(cycle_no>=0),
  due_date date not null,
  listening text,
  reading text,
  writing text,
  speaking text,
  attitude text not null,
  attendance_note text,
  homework_note text,
  strengths text not null,
  areas_to_improve text not null,
  overall_feedback text not null,
  recommendation text not null,
  status text not null default 'Draft' check(status in ('Draft','Submitted','Revision requested','Approved')),
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  revision_note text,
  cskh_touched_by uuid references auth.users(id),
  cskh_touched_at timestamptz,
  cskh_contact_method text,
  cskh_contact_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(enrollment_id,cycle_type,cycle_no)
);
create index if not exists idx_student_care_due on public.student_care_feedback(due_date,status);
alter table public.student_care_feedback enable row level security;
drop policy if exists student_care_select on public.student_care_feedback;
create policy student_care_select on public.student_care_feedback for select to authenticated using (
 public.current_role() in ('admin','academic_manager','customer_service') or
 (public.current_role()='teacher' and public.teacher_can_manage_enrollment(enrollment_id))
);
drop policy if exists student_care_insert on public.student_care_feedback;
create policy student_care_insert on public.student_care_feedback for insert to authenticated with check (
 (public.current_role()='teacher' and public.teacher_can_manage_enrollment(enrollment_id)) or public.current_role()='admin'
);
drop policy if exists student_care_update on public.student_care_feedback;
create policy student_care_update on public.student_care_feedback for update to authenticated using (
 public.current_role() in ('admin','academic_manager','customer_service') or
 (public.current_role()='teacher' and public.teacher_can_manage_enrollment(enrollment_id))
) with check (
 public.current_role() in ('admin','academic_manager','customer_service') or
 (public.current_role()='teacher' and public.teacher_can_manage_enrollment(enrollment_id))
);

commit;