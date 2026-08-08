-- ZE CenterOS v1.3.0 FIXED
-- Fix: preserve teacher_payroll_live_monthly existing columns during CREATE OR REPLACE VIEW.
-- Workforce scheduling, teacher session check-in/out, compliance KPI and staff payroll.
-- Safe to run after migrations 001-008.

begin;

create table if not exists public.workforce_settings (
  id smallint primary key default 1 check (id = 1),
  teacher_checkin_effective_from date not null default current_date,
  checkin_early_minutes integer not null default 60 check (checkin_early_minutes between 0 and 240),
  checkout_early_tolerance_minutes integer not null default 10 check (checkout_early_tolerance_minutes between 0 and 120),
  punctuality_grace_minutes integer not null default 0 check (punctuality_grace_minutes between 0 and 30),
  assignment_deadline_hours integer not null default 24 check (assignment_deadline_hours between 1 and 72),
  grading_deadline_days integer not null default 7 check (grading_deadline_days between 1 and 30),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.workforce_settings(id)
values (1)
on conflict (id) do nothing;

create table if not exists public.teacher_session_checkins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  check_in_at timestamptz,
  check_out_at timestamptz,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  early_checkout_minutes integer not null default 0 check (early_checkout_minutes >= 0),
  status text not null default 'Checked in' check (status in ('Checked in','Completed','Adjusted')),
  adjustment_note text,
  adjusted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, teacher_id),
  check (check_out_at is null or (check_in_at is not null and check_out_at >= check_in_at))
);

create index if not exists idx_teacher_session_checkins_teacher
  on public.teacher_session_checkins(teacher_id, check_in_at desc);
create index if not exists idx_teacher_session_checkins_session
  on public.teacher_session_checkins(session_id);

create table if not exists public.staff_work_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role in ('academic_manager','customer_service')),
  work_date date not null,
  start_time time not null,
  end_time time not null,
  work_mode text not null default 'Office' check (work_mode in ('Office','Remote','Hybrid')),
  location text,
  note text,
  status text not null default 'Planned' check (status in ('Planned','Approved','Cancelled')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, work_date, start_time, end_time),
  check (end_time > start_time)
);

create index if not exists idx_staff_work_schedules_user_date
  on public.staff_work_schedules(user_id, work_date);
create index if not exists idx_staff_work_schedules_date
  on public.staff_work_schedules(work_date, role);

create table if not exists public.staff_work_logs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null unique references public.staff_work_schedules(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  late_minutes integer not null default 0 check (late_minutes >= 0),
  status text not null default 'Checked in' check (status in ('Checked in','Completed','Adjusted')),
  adjustment_note text,
  adjusted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out_at is null or check_out_at >= check_in_at)
);

create index if not exists idx_staff_work_logs_user
  on public.staff_work_logs(user_id, check_in_at desc);

create table if not exists public.staff_compensation_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  role public.app_role not null check (role in ('academic_manager','customer_service')),
  hourly_rate numeric(14,2) not null check (hourly_rate between 20000 and 1500000),
  effective_from date not null default current_date,
  note text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_payroll_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.app_role not null check (role in ('academic_manager','customer_service')),
  payroll_month date not null,
  worked_hours numeric(10,2) not null default 0 check (worked_hours >= 0),
  hourly_rate_snapshot numeric(14,2) not null default 0 check (hourly_rate_snapshot >= 0),
  gross_amount numeric(16,2) not null default 0 check (gross_amount >= 0),
  employee_status text not null default 'Pending review' check (employee_status in ('Pending review','Approved','Disputed')),
  employee_note text,
  employee_reviewed_at timestamptz,
  admin_status text not null default 'Pending' check (admin_status in ('Pending','Approved','Paid')),
  admin_note text,
  admin_approved_by uuid references auth.users(id),
  admin_approved_at timestamptz,
  expense_transaction_id uuid references public.expense_transactions(id) on delete set null,
  generated_at timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, payroll_month)
);

alter table public.expense_transactions
  add column if not exists staff_user_id uuid references public.profiles(id) on delete set null;

create table if not exists public.teacher_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  kpi_month date not null,
  total_sessions integer not null default 0,
  payroll_eligible_sessions integer not null default 0,
  punctual_sessions integer not null default 0,
  assignment_compliant_sessions integer not null default 0,
  grading_due_count integer not null default 0,
  grading_on_time_count integer not null default 0,
  grading_pending_count integer not null default 0,
  punctuality_rate numeric(6,2),
  assignment_compliance_rate numeric(6,2),
  grading_compliance_rate numeric(6,2),
  overall_compliance_rate numeric(6,2),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(teacher_id, kpi_month)
);

-- ---------------------------------------------------------------------------
-- Teacher session compliance
-- ---------------------------------------------------------------------------
create or replace view public.teacher_session_compliance with (security_invoker=true) as
with cfg as (
  select * from public.workforce_settings where id=1
), base as (
  select
    st.teacher_id,
    t.user_id teacher_user_id,
    t.code teacher_code,
    t.full_name teacher_name,
    st.role teacher_role,
    st.payroll_factor,
    s.id session_id,
    s.class_id,
    c.code class_code,
    s.session_no,
    s.scheduled_date,
    s.start_time,
    s.end_time,
    s.duration_hours,
    s.status session_status,
    ((s.scheduled_date + s.start_time) at time zone 'Asia/Ho_Chi_Minh') scheduled_start_at,
    ((s.scheduled_date + s.end_time) at time zone 'Asia/Ho_Chi_Minh') scheduled_end_at,
    ci.check_in_at,
    ci.check_out_at,
    ci.late_minutes,
    cfg.teacher_checkin_effective_from,
    cfg.checkout_early_tolerance_minutes,
    cfg.punctuality_grace_minutes,
    cfg.assignment_deadline_hours
  from public.session_teachers st
  join public.teachers t on t.id=st.teacher_id
  join public.sessions s on s.id=st.session_id and s.archived_at is null
  join public.classes c on c.id=s.class_id
  cross join cfg
  left join public.teacher_session_checkins ci
    on ci.session_id=s.id and ci.teacher_id=t.id
  where st.role in ('Main teacher','Cover','Co-teacher')
)
select
  b.*,
  (b.scheduled_date >= b.teacher_checkin_effective_from) checkin_required,
  case
    when b.scheduled_date < b.teacher_checkin_effective_from then true
    else b.check_in_at is not null
      and b.check_out_at is not null
      and b.check_out_at >= b.scheduled_end_at - (b.checkout_early_tolerance_minutes * interval '1 minute')
  end payroll_eligible,
  case
    when b.check_in_at is null then false
    else b.check_in_at <= b.scheduled_start_at + (b.punctuality_grace_minutes * interval '1 minute')
  end punctual,
  a.assignment_published_at,
  case
    when a.assignment_published_at is null then false
    else a.assignment_published_at <= b.scheduled_end_at + (b.assignment_deadline_hours * interval '1 hour')
  end assignment_compliant
from base b
left join lateral (
  select min(a.published_at) assignment_published_at
  from public.assignments a
  where a.session_id=b.session_id
    and a.created_by=b.teacher_user_id
    and a.archived_at is null
    and a.published_at is not null
) a on true;

create or replace view public.teacher_grading_compliance with (security_invoker=true) as
with cfg as (
  select grading_deadline_days, teacher_checkin_effective_from from public.workforce_settings where id=1
)
select
  t.id teacher_id,
  t.code teacher_code,
  t.full_name teacher_name,
  a.id assignment_id,
  a.session_id,
  s.scheduled_date,
  sub.id submission_id,
  sub.student_id,
  sub.submitted_at,
  sub.graded_at,
  sub.graded_by,
  (sub.submitted_at + (cfg.grading_deadline_days * interval '1 day')) grading_deadline_at,
  (now() >= sub.submitted_at + (cfg.grading_deadline_days * interval '1 day') or sub.graded_at is not null) grading_due,
  (sub.graded_at is not null and sub.graded_by=t.user_id and sub.graded_at <= sub.submitted_at + (cfg.grading_deadline_days * interval '1 day')) graded_on_time
from public.assignments a
join public.sessions s on s.id=a.session_id and s.archived_at is null
join public.teachers t on t.user_id=a.created_by and t.archived_at is null
join public.assignment_submissions sub on sub.assignment_id=a.id
cross join cfg
where a.archived_at is null
  and a.published_at is not null
  and s.scheduled_date >= cfg.teacher_checkin_effective_from;

create or replace view public.teacher_kpi_live_monthly with (security_invoker=true) as
with session_kpi as (
  select
    teacher_id,
    date_trunc('month',scheduled_date)::date kpi_month,
    count(*) filter (where session_status in ('Completed','Make-up completed') and checkin_required) total_sessions,
    count(*) filter (where session_status in ('Completed','Make-up completed') and checkin_required and payroll_eligible) payroll_eligible_sessions,
    count(*) filter (where session_status in ('Completed','Make-up completed') and checkin_required and punctual) punctual_sessions,
    count(*) filter (where session_status in ('Completed','Make-up completed') and checkin_required and assignment_compliant) assignment_compliant_sessions
  from public.teacher_session_compliance
  group by teacher_id,date_trunc('month',scheduled_date)::date
), grading_kpi as (
  select
    teacher_id,
    date_trunc('month',scheduled_date)::date kpi_month,
    count(*) filter (where grading_due) grading_due_count,
    count(*) filter (where grading_due and graded_on_time) grading_on_time_count,
    count(*) filter (where not grading_due) grading_pending_count
  from public.teacher_grading_compliance
  group by teacher_id,date_trunc('month',scheduled_date)::date
)
select
  t.id teacher_id,
  t.code teacher_code,
  t.full_name teacher_name,
  coalesce(sk.kpi_month,gk.kpi_month) kpi_month,
  coalesce(sk.total_sessions,0) total_sessions,
  coalesce(sk.payroll_eligible_sessions,0) payroll_eligible_sessions,
  coalesce(sk.punctual_sessions,0) punctual_sessions,
  coalesce(sk.assignment_compliant_sessions,0) assignment_compliant_sessions,
  coalesce(gk.grading_due_count,0) grading_due_count,
  coalesce(gk.grading_on_time_count,0) grading_on_time_count,
  coalesce(gk.grading_pending_count,0) grading_pending_count,
  case when coalesce(sk.total_sessions,0)>0 then round(100.0*sk.punctual_sessions/sk.total_sessions,2) end punctuality_rate,
  case when coalesce(sk.total_sessions,0)>0 then round(100.0*sk.assignment_compliant_sessions/sk.total_sessions,2) end assignment_compliance_rate,
  case when coalesce(gk.grading_due_count,0)>0 then round(100.0*gk.grading_on_time_count/gk.grading_due_count,2) end grading_compliance_rate,
  case when coalesce(sk.total_sessions,0)>0 then round((
    (100.0*sk.punctual_sessions/sk.total_sessions) +
    (100.0*sk.assignment_compliant_sessions/sk.total_sessions) +
    coalesce(case when coalesce(gk.grading_due_count,0)>0 then 100.0*gk.grading_on_time_count/gk.grading_due_count end,100)
  )/3.0,2) end overall_compliance_rate
from public.teachers t
left join session_kpi sk on sk.teacher_id=t.id
left join grading_kpi gk on gk.teacher_id=t.id and gk.kpi_month=sk.kpi_month
where t.archived_at is null and coalesce(sk.kpi_month,gk.kpi_month) is not null;

-- ---------------------------------------------------------------------------
-- Check-in/out RPCs
-- ---------------------------------------------------------------------------
create or replace function public.teacher_check_in_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_teacher_id uuid := public.current_teacher_id();
  v_session public.sessions%rowtype;
  v_cfg public.workforce_settings%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz := now();
  v_late integer;
  v_id uuid;
begin
  if public.current_role()<>'teacher' or v_teacher_id is null then raise exception 'Teacher permission required'; end if;
  if not public.teacher_is_on_session(v_teacher_id,p_session_id) then raise exception 'Bạn không được phân công session này'; end if;

  select * into v_session from public.sessions where id=p_session_id and archived_at is null;
  if v_session.id is null then raise exception 'Session not found'; end if;
  if v_session.status='Cancelled' then raise exception 'Không thể check-in session đã huỷ'; end if;
  select * into v_cfg from public.workforce_settings where id=1;

  v_start := ((v_session.scheduled_date + v_session.start_time) at time zone 'Asia/Ho_Chi_Minh');
  v_end := ((v_session.scheduled_date + v_session.end_time) at time zone 'Asia/Ho_Chi_Minh');
  if v_now < v_start - (v_cfg.checkin_early_minutes * interval '1 minute') then
    raise exception 'Chỉ được check-in trong vòng % phút trước giờ học',v_cfg.checkin_early_minutes;
  end if;
  if v_now > v_end then raise exception 'Đã quá giờ kết thúc session. Liên hệ Học vụ nếu quên check-in'; end if;

  v_late := greatest(0,ceil(extract(epoch from (v_now - (v_start + v_cfg.punctuality_grace_minutes*interval '1 minute')))/60.0)::integer);

  insert into public.teacher_session_checkins(session_id,teacher_id,check_in_at,late_minutes,status)
  values(p_session_id,v_teacher_id,v_now,v_late,'Checked in')
  on conflict(session_id,teacher_id) do update set
    check_in_at=coalesce(public.teacher_session_checkins.check_in_at,excluded.check_in_at),
    late_minutes=case when public.teacher_session_checkins.check_in_at is null then excluded.late_minutes else public.teacher_session_checkins.late_minutes end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.teacher_check_out_session(p_session_id uuid,p_topic text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_teacher_id uuid := public.current_teacher_id();
  v_session public.sessions%rowtype;
  v_cfg public.workforce_settings%rowtype;
  v_end timestamptz;
  v_now timestamptz := now();
  v_early integer;
begin
  if public.current_role()<>'teacher' or v_teacher_id is null then raise exception 'Teacher permission required'; end if;
  select * into v_session from public.sessions where id=p_session_id and archived_at is null;
  if v_session.id is null then raise exception 'Session not found'; end if;
  select * into v_cfg from public.workforce_settings where id=1;
  v_end := ((v_session.scheduled_date + v_session.end_time) at time zone 'Asia/Ho_Chi_Minh');

  if not exists(select 1 from public.teacher_session_checkins where session_id=p_session_id and teacher_id=v_teacher_id and check_in_at is not null) then
    raise exception 'Bạn phải check-in trước khi check-out';
  end if;
  if v_now < v_end - (v_cfg.checkout_early_tolerance_minutes * interval '1 minute') then
    raise exception 'Chỉ được check-out trong vòng % phút trước giờ kết thúc',v_cfg.checkout_early_tolerance_minutes;
  end if;

  v_early := greatest(0,ceil(extract(epoch from (v_end-v_now))/60.0)::integer);
  update public.teacher_session_checkins set
    check_out_at=coalesce(check_out_at,v_now),
    early_checkout_minutes=case when check_out_at is null then v_early else early_checkout_minutes end,
    status='Completed',updated_at=now()
  where session_id=p_session_id and teacher_id=v_teacher_id;

  update public.sessions set
    status='Completed',completed_at=coalesce(completed_at,v_now),
    topic=coalesce(nullif(trim(coalesce(p_topic,'')),''),topic),updated_at=now()
  where id=p_session_id;
end;
$$;

-- Teacher completion after the effective date requires a completed check-in/out.
create or replace function public.complete_teaching_session(p_session_id uuid, p_topic text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_effective date;
begin
  if not (public.is_academic_manager() or public.teacher_has_session(p_session_id)) then
    raise exception 'Not allowed to complete this session';
  end if;
  select * into v_session from public.sessions where id=p_session_id;
  if v_session.id is null then raise exception 'Session not found'; end if;
  select teacher_checkin_effective_from into v_effective from public.workforce_settings where id=1;
  if public.current_role()='teacher' and v_session.scheduled_date>=v_effective and not exists(
    select 1 from public.teacher_session_checkins ci
    where ci.session_id=p_session_id and ci.teacher_id=public.current_teacher_id() and ci.check_in_at is not null and ci.check_out_at is not null
  ) then
    raise exception 'Từ ngày áp dụng chấm công, Giáo viên phải Check-in và Check-out trước khi Complete session';
  end if;
  update public.sessions
  set status='Completed',completed_at=coalesce(completed_at,now()),topic=coalesce(nullif(trim(p_topic),''),topic),updated_at=now()
  where id=p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff work schedule and clocking
-- ---------------------------------------------------------------------------
create or replace function public.staff_check_in(p_schedule_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_schedule public.staff_work_schedules%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz := now();
  v_late integer;
  v_id uuid;
begin
  if public.current_role() not in ('academic_manager','customer_service') then raise exception 'Staff permission required'; end if;
  select * into v_schedule from public.staff_work_schedules where id=p_schedule_id and user_id=auth.uid();
  if v_schedule.id is null then raise exception 'Ca làm không tồn tại hoặc không thuộc tài khoản này'; end if;
  if v_schedule.status='Cancelled' then raise exception 'Ca làm đã huỷ'; end if;
  v_start:=((v_schedule.work_date+v_schedule.start_time) at time zone 'Asia/Ho_Chi_Minh');
  v_end:=((v_schedule.work_date+v_schedule.end_time) at time zone 'Asia/Ho_Chi_Minh');
  if v_now < v_start-interval '60 minutes' then raise exception 'Chỉ được check-in trong vòng 60 phút trước ca'; end if;
  if v_now > v_end then raise exception 'Đã quá giờ kết thúc ca. Liên hệ Admin nếu quên check-in'; end if;
  v_late:=greatest(0,ceil(extract(epoch from (v_now-v_start))/60.0)::integer);
  insert into public.staff_work_logs(schedule_id,user_id,check_in_at,late_minutes,status)
  values(p_schedule_id,auth.uid(),v_now,v_late,'Checked in')
  on conflict(schedule_id) do update set
    check_in_at=coalesce(public.staff_work_logs.check_in_at,excluded.check_in_at),
    late_minutes=case when public.staff_work_logs.check_in_at is null then excluded.late_minutes else public.staff_work_logs.late_minutes end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.staff_check_out(p_schedule_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_log public.staff_work_logs%rowtype;
begin
  if public.current_role() not in ('academic_manager','customer_service') then raise exception 'Staff permission required'; end if;
  select * into v_log from public.staff_work_logs where schedule_id=p_schedule_id and user_id=auth.uid();
  if v_log.id is null then raise exception 'Bạn phải check-in trước khi check-out'; end if;
  if v_log.check_out_at is not null then return; end if;
  if now()-v_log.check_in_at > interval '16 hours' then raise exception 'Ca làm vượt 16 giờ. Liên hệ Admin để điều chỉnh'; end if;
  update public.staff_work_logs set check_out_at=now(),status='Completed',updated_at=now() where id=v_log.id;
end;
$$;

create or replace view public.staff_work_live_monthly with (security_invoker=true) as
select
  p.id user_id,
  p.full_name,
  p.role,
  date_trunc('month',s.work_date)::date work_month,
  round(sum(greatest(0,extract(epoch from (
    least(l.check_out_at,((s.work_date+s.end_time) at time zone 'Asia/Ho_Chi_Minh')) -
    greatest(l.check_in_at,((s.work_date+s.start_time) at time zone 'Asia/Ho_Chi_Minh'))
  ))/3600.0)),2) worked_hours,
  count(*) completed_shifts,
  count(*) filter (where l.late_minutes=0) punctual_shifts,
  coalesce(cs.hourly_rate,0) hourly_rate,
  round(sum(greatest(0,extract(epoch from (
    least(l.check_out_at,((s.work_date+s.end_time) at time zone 'Asia/Ho_Chi_Minh')) -
    greatest(l.check_in_at,((s.work_date+s.start_time) at time zone 'Asia/Ho_Chi_Minh'))
  ))/3600.0))*coalesce(cs.hourly_rate,0),2) estimated_payroll
from public.profiles p
join public.staff_work_schedules s on s.user_id=p.id and s.status<>'Cancelled'
join public.staff_work_logs l on l.schedule_id=s.id and l.check_out_at is not null
left join public.staff_compensation_settings cs on cs.user_id=p.id
where p.role in ('academic_manager','customer_service') and p.is_active=true
group by p.id,p.full_name,p.role,date_trunc('month',s.work_date)::date,cs.hourly_rate;

create or replace function public.update_staff_compensation_rate(
  p_user_id uuid,p_hourly_rate numeric,p_effective_from date default current_date,p_note text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_role public.app_role;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  select role into v_role from public.profiles where id=p_user_id and is_active=true;
  if v_role not in ('academic_manager','customer_service') then raise exception 'Chỉ áp dụng cho Academic hoặc CSKH'; end if;
  if coalesce(p_hourly_rate,0)<20000 or p_hourly_rate>1500000 then raise exception 'Đơn giá phải từ 20.000 đến 1.500.000 đ/giờ'; end if;
  insert into public.staff_compensation_settings(user_id,role,hourly_rate,effective_from,note,updated_by)
  values(p_user_id,v_role,p_hourly_rate,coalesce(p_effective_from,current_date),nullif(trim(coalesce(p_note,'')),''),auth.uid())
  on conflict(user_id) do update set role=excluded.role,hourly_rate=excluded.hourly_rate,effective_from=excluded.effective_from,note=excluded.note,updated_by=auth.uid(),updated_at=now();
  update public.staff_payroll_statements set
    hourly_rate_snapshot=p_hourly_rate,
    gross_amount=round(worked_hours*p_hourly_rate,2),
    employee_status=case when employee_status='Approved' then 'Pending review' else employee_status end,
    employee_reviewed_at=case when employee_status='Approved' then null else employee_reviewed_at end,
    employee_note=case when employee_status='Approved' then 'Đơn giá được Admin cập nhật; vui lòng kiểm tra lại.' else employee_note end,
    updated_at=now()
  where user_id=p_user_id and admin_status='Pending';
end;
$$;

create or replace function public.generate_staff_payroll_statements(p_month date,p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_month date:=date_trunc('month',p_month)::date;
  v_count integer:=0;
  r record;
  v_existing public.staff_payroll_statements%rowtype;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admin permission required'; end if;
  for r in
    select p.id user_id,p.full_name,p.role,coalesce(w.worked_hours,0) worked_hours,coalesce(cs.hourly_rate,0) hourly_rate
    from public.profiles p
    left join public.staff_work_live_monthly w on w.user_id=p.id and w.work_month=v_month
    left join public.staff_compensation_settings cs on cs.user_id=p.id
    where p.role in ('academic_manager','customer_service') and p.is_active=true
  loop
    select * into v_existing from public.staff_payroll_statements where user_id=r.user_id and payroll_month=v_month;
    if v_existing.id is null then
      insert into public.staff_payroll_statements(user_id,role,payroll_month,worked_hours,hourly_rate_snapshot,gross_amount)
      values(r.user_id,r.role,v_month,r.worked_hours,r.hourly_rate,round(r.worked_hours*r.hourly_rate,2));
      v_count:=v_count+1;
    elsif v_existing.admin_status='Pending' and (p_force or v_existing.worked_hours<>r.worked_hours or v_existing.hourly_rate_snapshot<>r.hourly_rate) then
      update public.staff_payroll_statements set
        worked_hours=r.worked_hours,hourly_rate_snapshot=r.hourly_rate,gross_amount=round(r.worked_hours*r.hourly_rate,2),
        employee_status='Pending review',employee_reviewed_at=null,
        employee_note='Giờ công hoặc đơn giá đã thay đổi; vui lòng kiểm tra lại.',generated_at=now(),updated_at=now()
      where id=v_existing.id;
      v_count:=v_count+1;
    end if;

    insert into public.notifications(recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata)
    values(r.user_id,'staff_payroll_ready','Bảng công tháng đã sẵn sàng',
      'Hệ thống đã tổng kết giờ công tháng '||to_char(v_month,'MM/YYYY')||'. Vui lòng kiểm tra và xác nhận.',
      '/workforce','High','staff-payroll-ready:'||r.user_id::text||':'||v_month::text,
      jsonb_build_object('payroll_month',v_month))
    on conflict(dedupe_key) do nothing;
  end loop;
  return v_count;
end;
$$;

create or replace function public.staff_review_payroll(p_statement_id uuid,p_decision text,p_note text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if public.current_role() not in ('academic_manager','customer_service') then raise exception 'Staff permission required'; end if;
  if p_decision not in ('Approved','Disputed') then raise exception 'Invalid payroll decision'; end if;
  update public.staff_payroll_statements set
    employee_status=p_decision,employee_note=nullif(trim(coalesce(p_note,'')),''),employee_reviewed_at=now(),updated_at=now()
  where id=p_statement_id and user_id=auth.uid() and admin_status='Pending';
  if not found then raise exception 'Bảng lương không tồn tại hoặc đã được Admin duyệt'; end if;
end;
$$;

create or replace function public.admin_approve_staff_payroll(p_statement_id uuid,p_admin_note text default null,p_mark_paid boolean default false)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_statement public.staff_payroll_statements%rowtype;
  v_profile public.profiles%rowtype;
  v_category_id uuid;
  v_expense_id uuid;
  v_source_key text;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  select * into v_statement from public.staff_payroll_statements where id=p_statement_id for update;
  if v_statement.id is null then raise exception 'Payroll statement not found'; end if;
  if v_statement.employee_status<>'Approved' then raise exception 'Nhân sự phải xác nhận bảng công/lương trước'; end if;
  if v_statement.worked_hours<=0 then raise exception 'Số giờ công đang bằng 0'; end if;
  if v_statement.hourly_rate_snapshot<=0 or v_statement.gross_amount<=0 then raise exception 'Chưa thiết lập đơn giá hợp lệ'; end if;
  select * into v_profile from public.profiles where id=v_statement.user_id;
  select id into v_category_id from public.finance_categories where code='PAYROLL_STAFF' and is_active=true;
  if v_category_id is null then raise exception 'Staff payroll category is missing'; end if;
  v_source_key:='staff-payroll-statement:'||v_statement.id::text;
  insert into public.expense_transactions(
    category_id,cost_type,expense_date,amount,vendor,description,payment_method,status,
    staff_user_id,payroll_month,source_key,created_by,approved_by,approved_at
  ) values(
    v_category_id,'Staff payroll',(v_statement.payroll_month+interval '1 month - 1 day')::date,
    v_statement.gross_amount,v_profile.full_name,
    'Lương nhân sự '||v_profile.full_name||' · '||v_statement.worked_hours||' giờ × '||v_statement.hourly_rate_snapshot||' đ',
    'Payroll',case when p_mark_paid then 'Paid' else 'Approved' end,
    v_statement.user_id,v_statement.payroll_month,v_source_key,auth.uid(),auth.uid(),now()
  ) on conflict(source_key) do update set
    amount=excluded.amount,vendor=excluded.vendor,description=excluded.description,status=excluded.status,
    approved_by=auth.uid(),approved_at=now(),archived_at=null,archived_by=null,updated_at=now()
  returning id into v_expense_id;
  update public.staff_payroll_statements set
    admin_status=case when p_mark_paid then 'Paid' else 'Approved' end,
    admin_note=nullif(trim(coalesce(p_admin_note,'')),''),admin_approved_by=auth.uid(),admin_approved_at=now(),
    expense_transaction_id=v_expense_id,locked_at=now(),updated_at=now()
  where id=p_statement_id;
  insert into public.notifications(recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata)
  values(v_statement.user_id,'staff_payroll_admin_approved','Bảng lương đã được Admin duyệt',
    'Bảng lương tháng '||to_char(v_statement.payroll_month,'MM/YYYY')||' đã được duyệt: '||to_char(v_statement.gross_amount,'FM999G999G999G990')||' VNĐ.',
    '/workforce','High','staff-payroll-admin-approved:'||p_statement_id::text,jsonb_build_object('amount',v_statement.gross_amount))
  on conflict(dedupe_key) do nothing;
  return v_expense_id;
end;
$$;

create or replace function public.admin_mark_staff_payroll_paid(p_statement_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_expense_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  select expense_transaction_id into v_expense_id from public.staff_payroll_statements where id=p_statement_id;
  if v_expense_id is null then raise exception 'Approve payroll before marking it paid'; end if;
  update public.expense_transactions set status='Paid',updated_at=now() where id=v_expense_id;
  update public.staff_payroll_statements set admin_status='Paid',updated_at=now() where id=p_statement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Teacher payroll now requires check-in/out from the configured effective date.
-- Historical completed sessions before that date remain payable.
-- ---------------------------------------------------------------------------
create or replace view public.teacher_payroll_live_monthly with (security_invoker=true) as
select
  -- IMPORTANT: keep the existing view column order/name from migration 006.
  -- PostgreSQL CREATE OR REPLACE VIEW cannot remove existing columns.
  t.id teacher_id,
  t.code teacher_code,
  t.full_name teacher_name,
  date_trunc('month',s.scheduled_date)::date payroll_month,
  round(sum(s.duration_hours*st.payroll_factor),2) completed_hours,
  coalesce(cs.hourly_rate,0) hourly_rate,
  round(sum(s.duration_hours*st.payroll_factor)*coalesce(cs.hourly_rate,0),2) estimated_payroll
from public.teachers t
join public.session_teachers st on st.teacher_id=t.id
join public.sessions s on s.id=st.session_id
cross join public.workforce_settings ws
left join public.teacher_compensation_settings cs on cs.teacher_id=t.id
left join public.teacher_session_checkins ci on ci.session_id=s.id and ci.teacher_id=t.id
where t.archived_at is null
  and s.archived_at is null
  and s.status in ('Completed','Make-up completed')
  and (
    -- Historical completed sessions before workforce check-in started remain payable.
    s.scheduled_date < ws.teacher_checkin_effective_from
    or (
      ci.check_in_at is not null
      and ci.check_out_at is not null
      and ci.check_out_at >= ((s.scheduled_date+s.end_time) at time zone 'Asia/Ho_Chi_Minh')
          - (ws.checkout_early_tolerance_minutes*interval '1 minute')
    )
  )
group by
  t.id,
  t.code,
  t.full_name,
  date_trunc('month',s.scheduled_date)::date,
  cs.hourly_rate;

create or replace function public.generate_teacher_payroll_statements(p_month date,p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_month date:=date_trunc('month',p_month)::date;
  v_count integer:=0;
  r record;
  v_existing public.teacher_payroll_statements%rowtype;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admin permission required'; end if;
  for r in
    select t.id teacher_id,t.user_id,t.full_name,coalesce(v.completed_hours,0) completed_hours,coalesce(cs.hourly_rate,0) hourly_rate
    from public.teachers t
    left join public.teacher_payroll_live_monthly v on v.teacher_id=t.id and v.payroll_month=v_month
    left join public.teacher_compensation_settings cs on cs.teacher_id=t.id
    where t.archived_at is null and coalesce(t.employment_status,'Active')<>'Inactive'
  loop
    select * into v_existing from public.teacher_payroll_statements where teacher_id=r.teacher_id and payroll_month=v_month;
    if v_existing.id is null then
      insert into public.teacher_payroll_statements(teacher_id,payroll_month,completed_hours,hourly_rate_snapshot,gross_amount)
      values(r.teacher_id,v_month,r.completed_hours,r.hourly_rate,round(r.completed_hours*r.hourly_rate,2));
      v_count:=v_count+1;
    elsif v_existing.admin_status='Pending' and (p_force or v_existing.completed_hours<>r.completed_hours or v_existing.hourly_rate_snapshot<>r.hourly_rate) then
      update public.teacher_payroll_statements set
        completed_hours=r.completed_hours,hourly_rate_snapshot=r.hourly_rate,gross_amount=round(r.completed_hours*r.hourly_rate,2),
        teacher_status='Pending review',teacher_note='Giờ đủ điều kiện lương hoặc đơn giá đã thay đổi; vui lòng kiểm tra lại.',
        teacher_reviewed_at=null,generated_at=now(),updated_at=now()
      where id=v_existing.id;
      v_count:=v_count+1;
    end if;
    if r.user_id is not null then
      insert into public.notifications(recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata)
      values(r.user_id,'payroll_ready','Bảng lương tháng đã sẵn sàng',
        'Hệ thống đã tổng kết các giờ dạy đủ Check-in/Check-out tháng '||to_char(v_month,'MM/YYYY')||'. Vui lòng kiểm tra và xác nhận.',
        '/payroll','High','payroll-ready-v130:'||r.teacher_id::text||':'||v_month::text,
        jsonb_build_object('teacher_id',r.teacher_id,'payroll_month',v_month))
      on conflict(dedupe_key) do nothing;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.generate_teacher_kpi_snapshots(p_month date,p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_month date:=date_trunc('month',p_month)::date; v_count integer:=0; r record;
begin
  if auth.uid() is not null and public.current_role() not in ('admin','academic_manager') then raise exception 'Manager permission required'; end if;
  for r in select * from public.teacher_kpi_live_monthly where kpi_month=v_month loop
    insert into public.teacher_kpi_snapshots(
      teacher_id,kpi_month,total_sessions,payroll_eligible_sessions,punctual_sessions,assignment_compliant_sessions,
      grading_due_count,grading_on_time_count,grading_pending_count,punctuality_rate,assignment_compliance_rate,
      grading_compliance_rate,overall_compliance_rate,generated_at
    ) values(
      r.teacher_id,v_month,r.total_sessions,r.payroll_eligible_sessions,r.punctual_sessions,r.assignment_compliant_sessions,
      r.grading_due_count,r.grading_on_time_count,r.grading_pending_count,r.punctuality_rate,r.assignment_compliance_rate,
      r.grading_compliance_rate,r.overall_compliance_rate,now()
    ) on conflict(teacher_id,kpi_month) do update set
      total_sessions=excluded.total_sessions,payroll_eligible_sessions=excluded.payroll_eligible_sessions,
      punctual_sessions=excluded.punctual_sessions,assignment_compliant_sessions=excluded.assignment_compliant_sessions,
      grading_due_count=excluded.grading_due_count,grading_on_time_count=excluded.grading_on_time_count,
      grading_pending_count=excluded.grading_pending_count,punctuality_rate=excluded.punctuality_rate,
      assignment_compliance_rate=excluded.assignment_compliance_rate,grading_compliance_rate=excluded.grading_compliance_rate,
      overall_compliance_rate=excluded.overall_compliance_rate,generated_at=now(),updated_at=now();
    v_count:=v_count+1;
    insert into public.notifications(recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata)
    select t.user_id,'teacher_kpi_ready','KPI tuân thủ tháng đã sẵn sàng',
      'KPI tháng '||to_char(v_month,'MM/YYYY')||' đã được tổng hợp từ dữ liệu Check-in, bài tập và chấm bài.',
      '/workforce/kpi?month='||to_char(v_month,'YYYY-MM'),'Normal','teacher-kpi-ready:'||r.teacher_id::text||':'||v_month::text,
      jsonb_build_object('teacher_id',r.teacher_id,'kpi_month',v_month)
    from public.teachers t where t.id=r.teacher_id and t.user_id is not null
    on conflict(dedupe_key) do nothing;
  end loop;
  return v_count;
end;
$$;

-- Month-end job now closes teacher payroll, staff payroll and teacher KPI.
create or replace function public.run_month_end_payroll_job()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_local_date date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_target_month date;
  v_count integer:=0;
begin
  if v_local_date=(date_trunc('month',v_local_date)+interval '1 month - 1 day')::date then
    v_target_month:=date_trunc('month',v_local_date)::date;
  elsif extract(day from v_local_date)=1 then
    v_target_month:=date_trunc('month',v_local_date-interval '1 day')::date;
  else
    return 0;
  end if;
  v_count:=v_count+public.generate_teacher_payroll_statements(v_target_month,true);
  v_count:=v_count+public.generate_staff_payroll_statements(v_target_month,true);
  v_count:=v_count+public.generate_teacher_kpi_snapshots(v_target_month,true);
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.workforce_settings enable row level security;
alter table public.teacher_session_checkins enable row level security;
alter table public.staff_work_schedules enable row level security;
alter table public.staff_work_logs enable row level security;
alter table public.staff_compensation_settings enable row level security;
alter table public.staff_payroll_statements enable row level security;
alter table public.teacher_kpi_snapshots enable row level security;

drop policy if exists workforce_settings_select on public.workforce_settings;
create policy workforce_settings_select on public.workforce_settings for select to authenticated using (true);
drop policy if exists workforce_settings_admin on public.workforce_settings;
create policy workforce_settings_admin on public.workforce_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists teacher_checkins_select on public.teacher_session_checkins;
create policy teacher_checkins_select on public.teacher_session_checkins for select to authenticated
using (public.is_academic_manager() or teacher_id=public.current_teacher_id());
drop policy if exists teacher_checkins_insert on public.teacher_session_checkins;
create policy teacher_checkins_insert on public.teacher_session_checkins for insert to authenticated
with check (teacher_id=public.current_teacher_id());
drop policy if exists teacher_checkins_update on public.teacher_session_checkins;
create policy teacher_checkins_update on public.teacher_session_checkins for update to authenticated
using (public.is_academic_manager() or teacher_id=public.current_teacher_id())
with check (public.is_academic_manager() or teacher_id=public.current_teacher_id());
drop policy if exists teacher_checkins_delete on public.teacher_session_checkins;
create policy teacher_checkins_delete on public.teacher_session_checkins for delete to authenticated using (public.is_admin());

drop policy if exists staff_schedule_select on public.staff_work_schedules;
create policy staff_schedule_select on public.staff_work_schedules for select to authenticated
using (public.is_admin() or user_id=auth.uid());
drop policy if exists staff_schedule_insert on public.staff_work_schedules;
create policy staff_schedule_insert on public.staff_work_schedules for insert to authenticated
with check (public.is_admin() or (user_id=auth.uid() and public.current_role() in ('academic_manager','customer_service')));
drop policy if exists staff_schedule_update on public.staff_work_schedules;
create policy staff_schedule_update on public.staff_work_schedules for update to authenticated
using (public.is_admin() or user_id=auth.uid())
with check (public.is_admin() or (user_id=auth.uid() and public.current_role() in ('academic_manager','customer_service')));
drop policy if exists staff_schedule_delete on public.staff_work_schedules;
create policy staff_schedule_delete on public.staff_work_schedules for delete to authenticated using (public.is_admin());

drop policy if exists staff_logs_select on public.staff_work_logs;
create policy staff_logs_select on public.staff_work_logs for select to authenticated
using (public.is_admin() or user_id=auth.uid());
drop policy if exists staff_logs_insert on public.staff_work_logs;
create policy staff_logs_insert on public.staff_work_logs for insert to authenticated
with check (user_id=auth.uid() and public.current_role() in ('academic_manager','customer_service'));
drop policy if exists staff_logs_update on public.staff_work_logs;
create policy staff_logs_update on public.staff_work_logs for update to authenticated
using (public.is_admin() or user_id=auth.uid())
with check (public.is_admin() or user_id=auth.uid());
drop policy if exists staff_logs_delete on public.staff_work_logs;
create policy staff_logs_delete on public.staff_work_logs for delete to authenticated using (public.is_admin());

drop policy if exists staff_comp_select on public.staff_compensation_settings;
create policy staff_comp_select on public.staff_compensation_settings for select to authenticated
using (public.is_admin() or user_id=auth.uid());
drop policy if exists staff_comp_admin on public.staff_compensation_settings;
create policy staff_comp_admin on public.staff_compensation_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists staff_payroll_select on public.staff_payroll_statements;
create policy staff_payroll_select on public.staff_payroll_statements for select to authenticated
using (public.is_admin() or user_id=auth.uid());
drop policy if exists staff_payroll_admin on public.staff_payroll_statements;
create policy staff_payroll_admin on public.staff_payroll_statements for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists teacher_kpi_select on public.teacher_kpi_snapshots;
create policy teacher_kpi_select on public.teacher_kpi_snapshots for select to authenticated
using (public.is_academic_manager() or teacher_id=public.current_teacher_id());
drop policy if exists teacher_kpi_admin_manage on public.teacher_kpi_snapshots;
create policy teacher_kpi_admin_manage on public.teacher_kpi_snapshots for all to authenticated
using (public.is_academic_manager()) with check (public.is_academic_manager());

-- Triggers and audit
drop trigger if exists set_updated_at_workforce_settings on public.workforce_settings;
create trigger set_updated_at_workforce_settings before update on public.workforce_settings for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_teacher_session_checkins on public.teacher_session_checkins;
create trigger set_updated_at_teacher_session_checkins before update on public.teacher_session_checkins for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_staff_work_schedules on public.staff_work_schedules;
create trigger set_updated_at_staff_work_schedules before update on public.staff_work_schedules for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_staff_work_logs on public.staff_work_logs;
create trigger set_updated_at_staff_work_logs before update on public.staff_work_logs for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_staff_compensation on public.staff_compensation_settings;
create trigger set_updated_at_staff_compensation before update on public.staff_compensation_settings for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_staff_payroll on public.staff_payroll_statements;
create trigger set_updated_at_staff_payroll before update on public.staff_payroll_statements for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_teacher_kpi_snapshots on public.teacher_kpi_snapshots;
create trigger set_updated_at_teacher_kpi_snapshots before update on public.teacher_kpi_snapshots for each row execute procedure public.set_updated_at();

drop trigger if exists audit_teacher_session_checkins on public.teacher_session_checkins;
create trigger audit_teacher_session_checkins after insert or update or delete on public.teacher_session_checkins for each row execute procedure public.audit_row_change();
drop trigger if exists audit_staff_work_schedules on public.staff_work_schedules;
create trigger audit_staff_work_schedules after insert or update or delete on public.staff_work_schedules for each row execute procedure public.audit_row_change();
drop trigger if exists audit_staff_work_logs on public.staff_work_logs;
create trigger audit_staff_work_logs after insert or update or delete on public.staff_work_logs for each row execute procedure public.audit_row_change();
drop trigger if exists audit_staff_compensation on public.staff_compensation_settings;
create trigger audit_staff_compensation after insert or update or delete on public.staff_compensation_settings for each row execute procedure public.audit_row_change();
drop trigger if exists audit_staff_payroll on public.staff_payroll_statements;
create trigger audit_staff_payroll after insert or update or delete on public.staff_payroll_statements for each row execute procedure public.audit_row_change();

-- Function permissions
revoke all on function public.teacher_check_in_session(uuid) from public,anon;
revoke all on function public.teacher_check_out_session(uuid,text) from public,anon;
revoke all on function public.staff_check_in(uuid) from public,anon;
revoke all on function public.staff_check_out(uuid) from public,anon;
revoke all on function public.update_staff_compensation_rate(uuid,numeric,date,text) from public,anon;
revoke all on function public.generate_staff_payroll_statements(date,boolean) from public,anon;
revoke all on function public.staff_review_payroll(uuid,text,text) from public,anon;
revoke all on function public.admin_approve_staff_payroll(uuid,text,boolean) from public,anon;
revoke all on function public.admin_mark_staff_payroll_paid(uuid) from public,anon;
revoke all on function public.generate_teacher_kpi_snapshots(date,boolean) from public,anon;
revoke all on function public.run_month_end_payroll_job() from public,anon,authenticated;
grant execute on function public.teacher_check_in_session(uuid) to authenticated;
grant execute on function public.teacher_check_out_session(uuid,text) to authenticated;
grant execute on function public.staff_check_in(uuid) to authenticated;
grant execute on function public.staff_check_out(uuid) to authenticated;
grant execute on function public.update_staff_compensation_rate(uuid,numeric,date,text) to authenticated;
grant execute on function public.generate_staff_payroll_statements(date,boolean) to authenticated;
grant execute on function public.staff_review_payroll(uuid,text,text) to authenticated;
grant execute on function public.admin_approve_staff_payroll(uuid,text,boolean) to authenticated;
grant execute on function public.admin_mark_staff_payroll_paid(uuid) to authenticated;
grant execute on function public.generate_teacher_kpi_snapshots(date,boolean) to authenticated;

commit;
