-- ZE CenterOS production schema
-- Run in Supabase SQL Editor or with Supabase CLI.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','academic_manager','teacher','customer_service','student');
create type public.delivery_mode as enum ('Online','Offline','Hybrid');
create type public.class_status as enum ('Draft','Waiting','Ready','Active','Paused','Completed','Closed');
create type public.session_status as enum ('Scheduled','Completed','Rescheduled','Cancelled','Make-up required','Make-up completed');
create type public.attendance_status as enum ('Present','Late','Excused absence','Unexcused absence','Joined partially','Make-up pending','Make-up completed');
create type public.homework_status as enum ('Completed','Partially completed','Not completed','Submitted late','Not assigned');
create type public.feedback_status as enum ('Draft','Submitted','Revision requested','Approved','Published','Rejected');
create type public.risk_level as enum ('Low','Medium','High');
create type public.payment_status as enum ('Open','Partially paid','Paid','Overdue','Closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'student',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  code text unique not null default ('STU-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  full_name text not null,
  date_of_birth date,
  phone text,
  email text,
  guardian_name text,
  guardian_phone text,
  source text,
  status text not null default 'Waiting for class',
  entry_level text,
  target text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  code text unique not null default ('TCH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  full_name text not null,
  phone text,
  email text,
  specialization text[] not null default '{}',
  employment_status text not null default 'Active',
  hourly_rate numeric(14,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  category text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  code text not null,
  name text not null,
  sequence_no integer not null default 1,
  is_active boolean not null default true,
  unique(program_id, code)
);

create table public.course_templates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  level_id uuid references public.levels(id) on delete restrict,
  name text not null,
  total_hours numeric(8,2) not null check(total_hours > 0),
  total_sessions integer not null check(total_sessions > 0),
  target text,
  midterm_percent integer not null default 50 check(midterm_percent between 1 and 99),
  final_percent integer not null default 100 check(final_percent = 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  category text not null check(category in ('ZE','ZK','B2B','Workshop','Mock Test','Trial','Other')),
  program_id uuid references public.programs(id) on delete restrict,
  level_id uuid references public.levels(id) on delete restrict,
  course_template_id uuid references public.course_templates(id) on delete restrict,
  mode public.delivery_mode not null,
  campus text,
  room text,
  start_date date,
  expected_end_date date,
  total_hours numeric(8,2) not null check(total_hours > 0),
  total_sessions integer not null check(total_sessions > 0),
  target text,
  capacity integer not null default 1 check(capacity > 0),
  status public.class_status not null default 'Draft',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create table public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  role text not null default 'Main teacher' check(role in ('Main teacher','Co-teacher','Assistant','Cover')),
  payroll_factor numeric(5,2) not null default 1 check(payroll_factor >= 0),
  assigned_at timestamptz not null default now(),
  unique(class_id, teacher_id, role)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  start_date date not null default current_date,
  end_date date,
  status text not null default 'Active',
  target text,
  enrolled_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  unique(student_id, class_id)
);

create table public.teacher_availability (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  weekday smallint not null check(weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  mode public.delivery_mode,
  campus text,
  effective_from date not null default current_date,
  effective_to date,
  is_recurring boolean not null default true,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_time > start_time)
);

create table public.student_availability (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  weekday smallint not null check(weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  effective_from date not null default current_date,
  effective_to date,
  is_recurring boolean not null default true,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_time > start_time)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  session_no integer not null check(session_no > 0),
  scheduled_date date not null,
  start_time time not null,
  end_time time not null,
  duration_hours numeric(6,2) not null check(duration_hours > 0),
  mode public.delivery_mode not null,
  campus text,
  room text,
  meeting_url text,
  status public.session_status not null default 'Scheduled',
  topic text,
  assignment_note text,
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  unique(class_id, session_no),
  check(end_time > start_time)
);

create table public.session_teachers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  role text not null default 'Main teacher' check(role in ('Main teacher','Co-teacher','Assistant','Cover')),
  payroll_factor numeric(5,2) not null default 1 check(payroll_factor >= 0),
  unique(session_id, teacher_id, role)
);

create table public.session_changes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  old_date date,
  new_date date,
  old_start_time time,
  new_start_time time,
  old_end_time time,
  new_end_time time,
  reason text not null,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status public.attendance_status not null,
  late_minutes integer not null default 0 check(late_minutes >= 0),
  reason text,
  marked_by uuid not null references auth.users(id),
  marked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, student_id)
);

create table public.homework_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status public.homework_status not null,
  note text,
  marked_by uuid not null references auth.users(id),
  marked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, student_id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  session_id uuid references public.sessions(id) on delete set null,
  title text not null,
  instructions text not null,
  due_at timestamptz,
  max_score numeric(8,2) not null default 100 check(max_score > 0),
  created_by uuid not null references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  file_path text not null,
  status text not null default 'Submitted',
  submitted_at timestamptz not null default now(),
  score numeric(8,2),
  feedback text,
  graded_by uuid references auth.users(id),
  graded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(assignment_id, student_id)
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  name text not null,
  type text not null check(type in ('Placement','Diagnostic','Quiz','Assignment','Midterm','Final','Mock Test','Speaking','Writing','Other')),
  assessment_date date,
  max_score numeric(8,2) not null default 100 check(max_score > 0),
  status text not null default 'Draft',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  score numeric(8,2),
  band text,
  cefr text,
  comment text,
  graded_by uuid not null references auth.users(id),
  graded_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(assessment_id, student_id)
);

create table public.progress_feedback (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  milestone integer not null check(milestone in (30,50,70,100)),
  strengths text not null,
  areas_to_improve text not null,
  attendance_summary text,
  homework_summary text,
  current_performance text not null,
  recommendation text not null,
  risk_level public.risk_level not null default 'Low',
  status public.feedback_status not null default 'Draft',
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  published_at timestamptz,
  revision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  unique(enrollment_id, milestone)
);

create table public.observation_templates (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.observation_criteria (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.observation_templates(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  max_score numeric(6,2) not null default 5 check(max_score > 0),
  weight numeric(6,3) not null default 1 check(weight > 0),
  sort_order integer not null default 1,
  unique(template_id, code)
);

create table public.teacher_observations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  session_id uuid references public.sessions(id) on delete set null,
  observer_id uuid not null references auth.users(id),
  template_id uuid not null references public.observation_templates(id) on delete restrict,
  type text not null default 'Scheduled' check(type in ('Scheduled','Random','Follow-up','Probation')),
  status text not null default 'Draft',
  total_score numeric(8,2),
  strengths text,
  areas_to_improve text,
  required_actions text,
  follow_up_due_at date,
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create table public.observation_scores (
  id uuid primary key default gen_random_uuid(),
  observation_id uuid not null references public.teacher_observations(id) on delete cascade,
  criterion_id uuid not null references public.observation_criteria(id) on delete restrict,
  score numeric(6,2) not null check(score >= 0),
  note text,
  unique(observation_id, criterion_id)
);

create table public.teacher_ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  overall smallint not null check(overall between 1 and 5),
  clarity smallint check(clarity between 1 and 5),
  engagement smallint check(engagement between 1 and 5),
  supportiveness smallint check(supportiveness between 1 and 5),
  pace smallint check(pace between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(session_id, student_id, teacher_id)
);

create table public.tuition_accounts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  enrollment_id uuid references public.enrollments(id) on delete set null,
  package_name text not null,
  gross_amount numeric(16,2) not null check(gross_amount >= 0),
  discount_amount numeric(16,2) not null default 0 check(discount_amount >= 0),
  net_amount numeric(16,2) not null check(net_amount >= 0),
  paid_amount numeric(16,2) not null default 0 check(paid_amount >= 0),
  balance_amount numeric(16,2) not null default 0,
  purchased_hours numeric(8,2),
  used_hours numeric(8,2) not null default 0,
  renewal_due_date date,
  status public.payment_status not null default 'Open',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  tuition_account_id uuid not null references public.tuition_accounts(id) on delete restrict,
  amount numeric(16,2) not null check(amount > 0),
  paid_at timestamptz not null default now(),
  method text,
  reference text,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.renewal_followups (
  id uuid primary key default gen_random_uuid(),
  tuition_account_id uuid not null references public.tuition_accounts(id) on delete restrict,
  assigned_to uuid references auth.users(id),
  due_at timestamptz not null,
  status text not null default 'Pending',
  outcome text,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index idx_students_user on public.students(user_id);
create index idx_teachers_user on public.teachers(user_id);
create index idx_classes_status on public.classes(status);
create index idx_class_teachers_teacher on public.class_teachers(teacher_id);
create index idx_enrollments_student on public.enrollments(student_id);
create index idx_enrollments_class on public.enrollments(class_id);
create index idx_sessions_date on public.sessions(scheduled_date);
create index idx_sessions_class on public.sessions(class_id);
create index idx_session_teachers_teacher on public.session_teachers(teacher_id);
create index idx_attendance_student on public.attendance(student_id);
create index idx_feedback_status on public.progress_feedback(status);
create index idx_tuition_renewal on public.tuition_accounts(renewal_due_date);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

create or replace function public.recalculate_tuition_account()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  account_id uuid;
  total_paid numeric(16,2);
  net numeric(16,2);
begin
  account_id := coalesce(new.tuition_account_id, old.tuition_account_id);
  select coalesce(sum(amount),0) into total_paid from public.payment_transactions where tuition_account_id = account_id;
  select net_amount into net from public.tuition_accounts where id = account_id;
  update public.tuition_accounts
  set paid_amount = total_paid,
      balance_amount = greatest(net - total_paid, 0),
      status = case
        when total_paid >= net then 'Paid'::public.payment_status
        when total_paid > 0 then 'Partially paid'::public.payment_status
        else 'Open'::public.payment_status
      end,
      updated_at = now()
  where id = account_id;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger payment_recalculate after insert or update or delete on public.payment_transactions
for each row execute procedure public.recalculate_tuition_account();

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.audit_logs(actor_id, action, table_name, record_id, old_data, new_data)
  values(
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id'),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','students','teachers','programs','levels','course_templates','classes','class_teachers','enrollments','teacher_availability','student_availability','sessions','session_teachers','attendance','homework_records','assignments','assignment_submissions','assessments','assessment_results','progress_feedback','teacher_observations','observation_scores','teacher_ratings','tuition_accounts','payment_transactions','renewal_followups']
  loop
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute procedure public.audit_row_change()', t, t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','students','teachers','programs','classes','enrollments','teacher_availability','student_availability','sessions','attendance','homework_records','assignments','assignment_submissions','assessments','assessment_results','progress_feedback','teacher_observations','tuition_accounts','renewal_followups']
  loop
    execute format('create trigger set_updated_at_%I before update on public.%I for each row execute procedure public.set_updated_at()', t, t);
  end loop;
end $$;

create or replace function public.update_own_profile(p_full_name text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if length(trim(p_full_name)) < 2 then raise exception 'Full name is required'; end if;
  update public.profiles set full_name = trim(p_full_name), updated_at = now() where id = auth.uid();
end;
$$;

create view public.class_progress with (security_invoker = true) as
select c.id, c.code, c.name, c.total_sessions,
       count(s.id) filter (where s.status in ('Completed','Make-up completed'))::integer as completed_sessions,
       case when c.total_sessions = 0 then 0 else round((count(s.id) filter (where s.status in ('Completed','Make-up completed'))::numeric / c.total_sessions) * 100, 1) end as progress_percent
from public.classes c
left join public.sessions s on s.class_id = c.id and s.archived_at is null
group by c.id;

create view public.teacher_monthly_hours with (security_invoker = true) as
select t.id as teacher_id, date_trunc('month', s.scheduled_date)::date as month,
       sum(s.duration_hours * st.payroll_factor) as completed_hours
from public.teachers t
join public.session_teachers st on st.teacher_id = t.id
join public.sessions s on s.id = st.session_id
where s.status in ('Completed','Make-up completed') and s.archived_at is null
group by t.id, date_trunc('month', s.scheduled_date);
