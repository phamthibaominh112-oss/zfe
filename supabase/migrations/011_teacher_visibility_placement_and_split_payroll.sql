-- ZE CenterOS v1.4.0
-- Fix teacher-session visibility, Placement Test operations, split Teaching/TA payroll,
-- and future staff schedule visibility support.

begin;

-- ---------------------------------------------------------------------------
-- Placement assessor flag
-- ---------------------------------------------------------------------------
alter table public.teachers
  add column if not exists is_placement_assessor boolean not null default false;

update public.teachers
set is_placement_assessor = true
where lower(coalesce(email,'')) in ('giaovien@gmail.com','baominh@gmail.com');


-- Teacher class visibility must include direct session assignments, not only class_teachers.
create or replace function public.can_view_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_role() in ('admin','academic_manager','customer_service')
    or public.teacher_has_class(p_class_id)
    or exists(
      select 1 from public.sessions s
      join public.session_teachers st on st.session_id=s.id
      where s.class_id=p_class_id and st.teacher_id=public.current_teacher_id()
    )
    or public.student_in_class(p_class_id)
$$;

drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated using (
  public.can_view_class(class_id)
  or (public.current_role()='teacher' and public.teacher_is_on_session(public.current_teacher_id(),id))
);

-- ---------------------------------------------------------------------------
-- Placement Test operations
-- ---------------------------------------------------------------------------
create table if not exists public.placement_tests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  familiarity text not null check (familiarity in ('New to IELTS','Familiar / Full test')),
  duration_minutes integer not null check (duration_minutes in (90,180)),
  scheduled_start timestamptz not null,
  status text not null default 'Scheduled' check (status in ('Scheduled','In progress','Completed','Validated','Released','Cancelled','No-show')),
  listening_score numeric(8,2),
  reading_score numeric(8,2),
  writing_score numeric(8,2),
  overall_score numeric(8,2),
  objective_note text,
  entry_level text,
  academic_note text,
  recommendation text,
  note text,
  completed_at timestamptz,
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  result_released_at timestamptz,
  followup_at timestamptz,
  followup_by uuid references auth.users(id),
  followup_note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create index if not exists idx_placement_tests_student on public.placement_tests(student_id,created_at desc);
create index if not exists idx_placement_tests_status on public.placement_tests(status,scheduled_start);

create table if not exists public.placement_speaking_bookings (
  id uuid primary key default gen_random_uuid(),
  placement_test_id uuid not null unique references public.placement_tests(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  scheduled_start timestamptz not null,
  duration_minutes integer not null default 15 check (duration_minutes=15),
  status text not null default 'Booked' check (status in ('Booked','Completed','Cancelled','No-show')),
  speaking_score numeric(8,2),
  assessor_note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_placement_speaking_teacher on public.placement_speaking_bookings(teacher_id,scheduled_start);

alter table public.placement_tests enable row level security;
alter table public.placement_speaking_bookings enable row level security;

create or replace function public.teacher_assigned_placement_test(p_placement_test_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.placement_speaking_bookings psb where psb.placement_test_id=p_placement_test_id and psb.teacher_id=public.current_teacher_id())
$$;

drop policy if exists placement_tests_select on public.placement_tests;
create policy placement_tests_select on public.placement_tests for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_assigned_placement_test(id)
);
drop policy if exists placement_tests_insert on public.placement_tests;
create policy placement_tests_insert on public.placement_tests for insert to authenticated with check (public.current_role() in ('admin','academic_manager','customer_service'));
drop policy if exists placement_tests_update on public.placement_tests;
create policy placement_tests_update on public.placement_tests for update to authenticated using (public.current_role() in ('admin','academic_manager','customer_service')) with check (public.current_role() in ('admin','academic_manager','customer_service'));
drop policy if exists placement_tests_delete on public.placement_tests;
create policy placement_tests_delete on public.placement_tests for delete to authenticated using (public.is_admin());

drop policy if exists placement_speaking_select on public.placement_speaking_bookings;
create policy placement_speaking_select on public.placement_speaking_bookings for select to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service') or teacher_id=public.current_teacher_id()
);
drop policy if exists placement_speaking_insert on public.placement_speaking_bookings;
create policy placement_speaking_insert on public.placement_speaking_bookings for insert to authenticated with check (public.current_role() in ('admin','academic_manager','customer_service'));
drop policy if exists placement_speaking_update on public.placement_speaking_bookings;
create policy placement_speaking_update on public.placement_speaking_bookings for update to authenticated using (
  public.current_role() in ('admin','academic_manager','customer_service') or teacher_id=public.current_teacher_id()
) with check (
  public.current_role() in ('admin','academic_manager','customer_service') or teacher_id=public.current_teacher_id()
);
drop policy if exists placement_speaking_delete on public.placement_speaking_bookings;
create policy placement_speaking_delete on public.placement_speaking_bookings for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Teacher session compliance: Assistant/TA must also see and check-in the same session.
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
  left join public.teacher_session_checkins ci on ci.session_id=s.id and ci.teacher_id=t.id
  where st.role in ('Main teacher','Cover','Co-teacher','Assistant')
)
select
  b.*,
  (b.scheduled_date >= b.teacher_checkin_effective_from) checkin_required,
  case when b.scheduled_date < b.teacher_checkin_effective_from then true
    else b.check_in_at is not null and b.check_out_at is not null
      and b.check_out_at >= b.scheduled_end_at - (b.checkout_early_tolerance_minutes * interval '1 minute') end payroll_eligible,
  case when b.check_in_at is null then false
    else b.check_in_at <= b.scheduled_start_at + (b.punctuality_grace_minutes * interval '1 minute') end punctual,
  a.assignment_published_at,
  case
    when b.teacher_role='Assistant' then true
    when a.assignment_published_at is null then false
    else a.assignment_published_at <= b.scheduled_end_at + (b.assignment_deadline_hours * interval '1 hour')
  end assignment_compliant
from base b
left join lateral (
  select min(a.published_at) assignment_published_at
  from public.assignments a
  where a.session_id=b.session_id and a.created_by=b.teacher_user_id and a.archived_at is null and a.published_at is not null
) a on true;

-- KPI teaching duties exclude Assistant sessions from teaching/homework denominator.
create or replace view public.teacher_kpi_live_monthly with (security_invoker=true) as
with session_kpi as (
  select teacher_id,date_trunc('month',scheduled_date)::date kpi_month,
    count(*) filter (where teacher_role<>'Assistant' and session_status in ('Completed','Make-up completed') and checkin_required) total_sessions,
    count(*) filter (where session_status in ('Completed','Make-up completed') and checkin_required and payroll_eligible) payroll_eligible_sessions,
    count(*) filter (where teacher_role<>'Assistant' and session_status in ('Completed','Make-up completed') and checkin_required and punctual) punctual_sessions,
    count(*) filter (where teacher_role<>'Assistant' and session_status in ('Completed','Make-up completed') and checkin_required and assignment_compliant) assignment_compliant_sessions
  from public.teacher_session_compliance
  group by teacher_id,date_trunc('month',scheduled_date)::date
), grading_kpi as (
  select teacher_id,date_trunc('month',scheduled_date)::date kpi_month,
    count(*) filter (where grading_due) grading_due_count,
    count(*) filter (where grading_due and graded_on_time) grading_on_time_count,
    count(*) filter (where not grading_due) grading_pending_count
  from public.teacher_grading_compliance
  group by teacher_id,date_trunc('month',scheduled_date)::date
)
select t.id teacher_id,t.code teacher_code,t.full_name teacher_name,coalesce(sk.kpi_month,gk.kpi_month) kpi_month,
  coalesce(sk.total_sessions,0) total_sessions,coalesce(sk.payroll_eligible_sessions,0) payroll_eligible_sessions,
  coalesce(sk.punctual_sessions,0) punctual_sessions,coalesce(sk.assignment_compliant_sessions,0) assignment_compliant_sessions,
  coalesce(gk.grading_due_count,0) grading_due_count,coalesce(gk.grading_on_time_count,0) grading_on_time_count,
  coalesce(gk.grading_pending_count,0) grading_pending_count,
  case when coalesce(sk.total_sessions,0)>0 then round(100.0*sk.punctual_sessions/sk.total_sessions,2) end punctuality_rate,
  case when coalesce(sk.total_sessions,0)>0 then round(100.0*sk.assignment_compliant_sessions/sk.total_sessions,2) end assignment_compliance_rate,
  case when coalesce(gk.grading_due_count,0)>0 then round(100.0*gk.grading_on_time_count/gk.grading_due_count,2) end grading_compliance_rate,
  case when coalesce(sk.total_sessions,0)>0 then round(((100.0*sk.punctual_sessions/sk.total_sessions)+(100.0*sk.assignment_compliant_sessions/sk.total_sessions)+coalesce(case when coalesce(gk.grading_due_count,0)>0 then 100.0*gk.grading_on_time_count/gk.grading_due_count end,100))/3.0,2) end overall_compliance_rate
from public.teachers t
left join session_kpi sk on sk.teacher_id=t.id
left join grading_kpi gk on gk.teacher_id=t.id and gk.kpi_month=sk.kpi_month
where t.archived_at is null and coalesce(sk.kpi_month,gk.kpi_month) is not null;

-- ---------------------------------------------------------------------------
-- Split Teaching vs TA compensation.
-- ---------------------------------------------------------------------------
alter table public.teacher_compensation_settings
  add column if not exists ta_hourly_rate numeric(14,2) not null default 0 check (ta_hourly_rate >= 0);

alter table public.teacher_payroll_statements
  add column if not exists teaching_hours numeric(10,2) not null default 0,
  add column if not exists ta_hours numeric(10,2) not null default 0,
  add column if not exists ta_hourly_rate_snapshot numeric(14,2) not null default 0,
  add column if not exists teaching_amount numeric(16,2) not null default 0,
  add column if not exists ta_amount numeric(16,2) not null default 0;

drop function if exists public.update_teacher_compensation_rate(uuid,numeric,date,text);
create or replace function public.update_teacher_compensation_rate(
  p_teacher_id uuid,
  p_hourly_rate numeric,
  p_ta_hourly_rate numeric default 0,
  p_effective_from date default current_date,
  p_note text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if coalesce(p_hourly_rate,0)<50000 or p_hourly_rate>1500000 then raise exception 'Teaching rate must be 50,000–1,500,000'; end if;
  if coalesce(p_ta_hourly_rate,0)<0 or p_ta_hourly_rate>1500000 then raise exception 'TA rate must be 0–1,500,000'; end if;
  insert into public.teacher_compensation_settings(teacher_id,hourly_rate,ta_hourly_rate,effective_from,note,updated_by)
  values(p_teacher_id,p_hourly_rate,p_ta_hourly_rate,coalesce(p_effective_from,current_date),nullif(trim(coalesce(p_note,'')),''),auth.uid())
  on conflict(teacher_id) do update set hourly_rate=excluded.hourly_rate,ta_hourly_rate=excluded.ta_hourly_rate,effective_from=excluded.effective_from,note=excluded.note,updated_by=auth.uid(),updated_at=now();
end; $$;

create or replace view public.teacher_payroll_live_monthly with (security_invoker=true) as
select
  t.id teacher_id,t.code teacher_code,t.full_name teacher_name,date_trunc('month',s.scheduled_date)::date payroll_month,
  round(sum(s.duration_hours*st.payroll_factor),2) completed_hours,
  coalesce(cs.hourly_rate,0) hourly_rate,
  round(
    sum(case when st.role='Assistant' then 0 else s.duration_hours*st.payroll_factor end)*coalesce(cs.hourly_rate,0)
    + sum(case when st.role='Assistant' then s.duration_hours*st.payroll_factor else 0 end)*coalesce(cs.ta_hourly_rate,0),2
  ) estimated_payroll,
  round(sum(case when st.role='Assistant' then 0 else s.duration_hours*st.payroll_factor end),2) teaching_hours,
  round(sum(case when st.role='Assistant' then s.duration_hours*st.payroll_factor else 0 end),2) ta_hours,
  coalesce(cs.hourly_rate,0) teaching_rate,
  coalesce(cs.ta_hourly_rate,0) ta_hourly_rate,
  round(sum(case when st.role='Assistant' then 0 else s.duration_hours*st.payroll_factor end)*coalesce(cs.hourly_rate,0),2) teaching_amount,
  round(sum(case when st.role='Assistant' then s.duration_hours*st.payroll_factor else 0 end)*coalesce(cs.ta_hourly_rate,0),2) ta_amount
from public.teachers t
join public.session_teachers st on st.teacher_id=t.id
join public.sessions s on s.id=st.session_id
cross join public.workforce_settings ws
left join public.teacher_compensation_settings cs on cs.teacher_id=t.id
left join public.teacher_session_checkins ci on ci.session_id=s.id and ci.teacher_id=t.id
where t.archived_at is null and s.archived_at is null and s.status in ('Completed','Make-up completed')
  and (s.scheduled_date < ws.teacher_checkin_effective_from or (ci.check_in_at is not null and ci.check_out_at is not null and ci.check_out_at >= ((s.scheduled_date+s.end_time) at time zone 'Asia/Ho_Chi_Minh')-(ws.checkout_early_tolerance_minutes*interval '1 minute')))
group by t.id,t.code,t.full_name,date_trunc('month',s.scheduled_date)::date,cs.hourly_rate,cs.ta_hourly_rate;

create or replace function public.generate_teacher_payroll_statements(p_month date,p_force boolean default false)
returns integer language plpgsql security definer set search_path=public as $$
declare v_month date:=date_trunc('month',p_month)::date; v_count integer:=0; r record; v_existing public.teacher_payroll_statements%rowtype;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admin permission required'; end if;
  for r in
    select t.id teacher_id,t.user_id,t.full_name,
      coalesce(v.completed_hours,0) completed_hours,coalesce(v.teaching_hours,0) teaching_hours,coalesce(v.ta_hours,0) ta_hours,
      coalesce(cs.hourly_rate,0) hourly_rate,coalesce(cs.ta_hourly_rate,0) ta_hourly_rate,
      coalesce(v.teaching_amount,0) teaching_amount,coalesce(v.ta_amount,0) ta_amount,coalesce(v.estimated_payroll,0) gross_amount
    from public.teachers t
    left join public.teacher_payroll_live_monthly v on v.teacher_id=t.id and v.payroll_month=v_month
    left join public.teacher_compensation_settings cs on cs.teacher_id=t.id
    where t.archived_at is null and coalesce(t.employment_status,'Active')<>'Inactive'
  loop
    select * into v_existing from public.teacher_payroll_statements where teacher_id=r.teacher_id and payroll_month=v_month;
    if v_existing.id is null then
      insert into public.teacher_payroll_statements(teacher_id,payroll_month,completed_hours,teaching_hours,ta_hours,hourly_rate_snapshot,ta_hourly_rate_snapshot,teaching_amount,ta_amount,gross_amount)
      values(r.teacher_id,v_month,r.completed_hours,r.teaching_hours,r.ta_hours,r.hourly_rate,r.ta_hourly_rate,r.teaching_amount,r.ta_amount,r.gross_amount);
      v_count:=v_count+1;
    elsif v_existing.admin_status='Pending' and (p_force or v_existing.completed_hours<>r.completed_hours or v_existing.hourly_rate_snapshot<>r.hourly_rate or v_existing.ta_hourly_rate_snapshot<>r.ta_hourly_rate) then
      update public.teacher_payroll_statements set completed_hours=r.completed_hours,teaching_hours=r.teaching_hours,ta_hours=r.ta_hours,
        hourly_rate_snapshot=r.hourly_rate,ta_hourly_rate_snapshot=r.ta_hourly_rate,teaching_amount=r.teaching_amount,ta_amount=r.ta_amount,gross_amount=r.gross_amount,
        teacher_status='Pending review',teacher_note='Giờ Teaching/TA hoặc đơn giá đã thay đổi; vui lòng kiểm tra lại.',teacher_reviewed_at=null,generated_at=now(),updated_at=now()
      where id=v_existing.id; v_count:=v_count+1;
    end if;
    if r.user_id is not null then
      insert into public.notifications(recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata)
      values(r.user_id,'payroll_ready','Bảng lương tháng đã sẵn sàng','Đã tổng kết riêng giờ Teaching và TA tháng '||to_char(v_month,'MM/YYYY')||'. Vui lòng kiểm tra.','/payroll','High','payroll-ready-v140:'||r.teacher_id::text||':'||v_month::text,jsonb_build_object('teacher_id',r.teacher_id,'payroll_month',v_month))
      on conflict(dedupe_key) do nothing;
    end if;
  end loop;
  return v_count;
end; $$;

-- Keep update timestamps for placement records.
drop trigger if exists set_updated_at_placement_tests on public.placement_tests;
create trigger set_updated_at_placement_tests before update on public.placement_tests for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_placement_speaking on public.placement_speaking_bookings;
create trigger set_updated_at_placement_speaking before update on public.placement_speaking_bookings for each row execute procedure public.set_updated_at();

commit;
