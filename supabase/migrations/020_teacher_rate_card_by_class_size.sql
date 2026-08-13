-- ZE CenterOS v1.7.0
-- Teacher Rate Card by class size + payroll slip model
--
-- Business rule:
--   Tutoring / Kèm: 1–3 active students
--   Group / Nhóm:   >3 active students
--   TA: separate rate
--
-- Historical fallback when a legacy session has no roster:
--   category ZK => Tutoring
--   other categories => Group

begin;

alter table public.teacher_compensation_settings
  add column if not exists tutoring_hourly_rate numeric(14,2) not null default 0 check (tutoring_hourly_rate >= 0),
  add column if not exists group_hourly_rate numeric(14,2) not null default 0 check (group_hourly_rate >= 0);

-- Initialize new columns from existing Teaching rate so no existing teacher drops to zero.
update public.teacher_compensation_settings
set tutoring_hourly_rate = case when tutoring_hourly_rate=0 then hourly_rate else tutoring_hourly_rate end,
    group_hourly_rate    = case when group_hourly_rate=0 then hourly_rate else group_hourly_rate end;

alter table public.teacher_payroll_statements
  add column if not exists tutoring_hours numeric(10,2) not null default 0,
  add column if not exists group_hours numeric(10,2) not null default 0,
  add column if not exists tutoring_rate_snapshot numeric(14,2) not null default 0,
  add column if not exists group_rate_snapshot numeric(14,2) not null default 0,
  add column if not exists tutoring_amount numeric(16,2) not null default 0,
  add column if not exists group_amount numeric(16,2) not null default 0;

-- Replace old 5-argument rate RPC with explicit Kèm/Nhóm/TA rate card.
drop function if exists public.update_teacher_compensation_rate(uuid,numeric,numeric,date,text);
create or replace function public.update_teacher_compensation_rate(
  p_teacher_id uuid,
  p_tutoring_hourly_rate numeric,
  p_group_hourly_rate numeric,
  p_ta_hourly_rate numeric default 0,
  p_effective_from date default current_date,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if coalesce(p_tutoring_hourly_rate,0)<50000 or p_tutoring_hourly_rate>1500000 then
    raise exception 'Tutoring rate must be 50,000–1,500,000';
  end if;
  if coalesce(p_group_hourly_rate,0)<50000 or p_group_hourly_rate>1500000 then
    raise exception 'Group rate must be 50,000–1,500,000';
  end if;
  if coalesce(p_ta_hourly_rate,0)<0 or p_ta_hourly_rate>1500000 then
    raise exception 'TA rate must be 0–1,500,000';
  end if;

  insert into public.teacher_compensation_settings(
    teacher_id,hourly_rate,tutoring_hourly_rate,group_hourly_rate,ta_hourly_rate,
    effective_from,note,updated_by
  )
  values(
    p_teacher_id,p_group_hourly_rate,p_tutoring_hourly_rate,p_group_hourly_rate,p_ta_hourly_rate,
    coalesce(p_effective_from,current_date),nullif(trim(coalesce(p_note,'')),''),auth.uid()
  )
  on conflict(teacher_id) do update set
    hourly_rate=excluded.hourly_rate,
    tutoring_hourly_rate=excluded.tutoring_hourly_rate,
    group_hourly_rate=excluded.group_hourly_rate,
    ta_hourly_rate=excluded.ta_hourly_rate,
    effective_from=excluded.effective_from,
    note=excluded.note,
    updated_by=auth.uid(),
    updated_at=now();
end;
$$;

grant execute on function public.update_teacher_compensation_rate(uuid,numeric,numeric,numeric,date,text) to authenticated;

-- HR rate card received 13/08/2026.
-- Unspecified TA rates are preserved.
insert into public.teacher_compensation_settings(
  teacher_id,hourly_rate,tutoring_hourly_rate,group_hourly_rate,ta_hourly_rate,effective_from,note
)
select
  t.id,
  seed.group_rate,
  seed.tutoring_rate,
  seed.group_rate,
  coalesce(existing.ta_hourly_rate,0),
  date '2026-08-01',
  'HR rate card · Kèm 1–3 HV / Nhóm >3 HV · 13/08/2026'
from public.teachers t
join (
  values
    ('TCH-DUNG'::text,315000::numeric,365000::numeric),
    ('TCH-NHUNG'::text,375000::numeric,425000::numeric),
    ('TCH-MINH'::text,50000::numeric,50000::numeric),
    ('TCH-NAM'::text,50000::numeric,50000::numeric),
    ('TCH-THINH'::text,100000::numeric,100000::numeric)
) as seed(code,tutoring_rate,group_rate) on upper(t.code)=seed.code
left join public.teacher_compensation_settings existing on existing.teacher_id=t.id
where t.archived_at is null
on conflict(teacher_id) do update set
  hourly_rate=excluded.hourly_rate,
  tutoring_hourly_rate=excluded.tutoring_hourly_rate,
  group_hourly_rate=excluded.group_hourly_rate,
  effective_from=excluded.effective_from,
  note=excluded.note,
  updated_at=now();

-- Session-level source of truth used by timesheet and payroll.
create or replace view public.teacher_payroll_session_detail with (security_invoker=true) as
with base as (
  select
    t.id teacher_id,
    t.code teacher_code,
    t.full_name teacher_name,
    s.id session_id,
    s.class_id,
    c.code class_code,
    c.name class_name,
    c.category class_category,
    s.session_no,
    s.scheduled_date,
    s.start_time,
    s.end_time,
    s.duration_hours,
    s.status session_status,
    st.role teacher_role,
    st.payroll_factor,
    ci.check_in_at,
    ci.check_out_at,
    ci.late_minutes,
    coalesce(cs.tutoring_hourly_rate,cs.hourly_rate,0) tutoring_rate,
    coalesce(cs.group_hourly_rate,cs.hourly_rate,0) group_rate,
    coalesce(cs.ta_hourly_rate,0) ta_rate,
    ws.checkout_early_tolerance_minutes,
    coalesce(roster.class_size,0) class_size
  from public.teachers t
  join public.session_teachers st on st.teacher_id=t.id
  join public.sessions s on s.id=st.session_id
  join public.classes c on c.id=s.class_id
  cross join public.workforce_settings ws
  left join public.teacher_compensation_settings cs on cs.teacher_id=t.id
  left join public.teacher_session_checkins ci on ci.session_id=s.id and ci.teacher_id=t.id
  left join lateral (
    select count(*)::integer class_size
    from public.enrollments e
    where e.class_id=s.class_id
      and e.archived_at is null
      and e.status='Active'
      and coalesce(e.start_date,s.scheduled_date)<=s.scheduled_date
      and (e.end_date is null or e.end_date>=s.scheduled_date)
  ) roster on true
  where t.archived_at is null
    and s.archived_at is null
)
select
  *,
  case
    when teacher_role='Assistant' then 'TA'
    when class_size between 1 and 3 then 'Tutoring'
    when class_size>3 then 'Group'
    when class_category='ZK' then 'Tutoring'
    else 'Group'
  end rate_type,
  case
    when teacher_role='Assistant' then ta_rate
    when class_size between 1 and 3 then tutoring_rate
    when class_size>3 then group_rate
    when class_category='ZK' then tutoring_rate
    else group_rate
  end applied_rate,
  case
    when session_status='Cancelled' then false
    when check_in_at is null or check_out_at is null then false
    when check_out_at < ((scheduled_date+end_time) at time zone 'Asia/Ho_Chi_Minh')
      -(checkout_early_tolerance_minutes*interval '1 minute') then false
    else true
  end payroll_eligible,
  case
    when session_status='Cancelled'
      or check_in_at is null
      or check_out_at is null
      or check_out_at < ((scheduled_date+end_time) at time zone 'Asia/Ho_Chi_Minh')
        -(checkout_early_tolerance_minutes*interval '1 minute')
    then 0::numeric
    else round(duration_hours*payroll_factor,2)
  end payable_hours,
  case
    when session_status='Cancelled'
      or check_in_at is null
      or check_out_at is null
      or check_out_at < ((scheduled_date+end_time) at time zone 'Asia/Ho_Chi_Minh')
        -(checkout_early_tolerance_minutes*interval '1 minute')
    then 0::numeric
    else round(
      duration_hours*payroll_factor*
      case
        when teacher_role='Assistant' then ta_rate
        when class_size between 1 and 3 then tutoring_rate
        when class_size>3 then group_rate
        when class_category='ZK' then tutoring_rate
        else group_rate
      end
    ,2)
  end pay_amount
from base;

create or replace view public.teacher_payroll_live_monthly with (security_invoker=true) as
select
  teacher_id,teacher_code,teacher_name,date_trunc('month',scheduled_date)::date payroll_month,
  round(sum(payable_hours),2) completed_hours,
  coalesce(max(group_rate),0) hourly_rate,
  round(sum(pay_amount),2) estimated_payroll,
  round(sum(case when rate_type in ('Tutoring','Group') then payable_hours else 0 end),2) teaching_hours,
  round(sum(case when rate_type='TA' then payable_hours else 0 end),2) ta_hours,
  coalesce(max(group_rate),0) teaching_rate,
  coalesce(max(ta_rate),0) ta_hourly_rate,
  round(sum(case when rate_type in ('Tutoring','Group') then pay_amount else 0 end),2) teaching_amount,
  round(sum(case when rate_type='TA' then pay_amount else 0 end),2) ta_amount,
  round(sum(case when rate_type='Tutoring' then payable_hours else 0 end),2) tutoring_hours,
  round(sum(case when rate_type='Group' then payable_hours else 0 end),2) group_hours,
  coalesce(max(tutoring_rate),0) tutoring_rate,
  coalesce(max(group_rate),0) group_rate,
  round(sum(case when rate_type='Tutoring' then pay_amount else 0 end),2) tutoring_amount,
  round(sum(case when rate_type='Group' then pay_amount else 0 end),2) group_amount
from public.teacher_payroll_session_detail
group by teacher_id,teacher_code,teacher_name,date_trunc('month',scheduled_date)::date;

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
    select
      t.id teacher_id,t.user_id,t.full_name,
      coalesce(v.completed_hours,0) completed_hours,
      coalesce(v.teaching_hours,0) teaching_hours,
      coalesce(v.ta_hours,0) ta_hours,
      coalesce(v.tutoring_hours,0) tutoring_hours,
      coalesce(v.group_hours,0) group_hours,
      coalesce(v.group_rate,coalesce(cs.group_hourly_rate,cs.hourly_rate,0)) hourly_rate,
      coalesce(v.tutoring_rate,coalesce(cs.tutoring_hourly_rate,cs.hourly_rate,0)) tutoring_rate,
      coalesce(v.group_rate,coalesce(cs.group_hourly_rate,cs.hourly_rate,0)) group_rate,
      coalesce(v.ta_hourly_rate,coalesce(cs.ta_hourly_rate,0)) ta_hourly_rate,
      coalesce(v.tutoring_amount,0) tutoring_amount,
      coalesce(v.group_amount,0) group_amount,
      coalesce(v.teaching_amount,0) teaching_amount,
      coalesce(v.ta_amount,0) ta_amount,
      coalesce(v.estimated_payroll,0) gross_amount
    from public.teachers t
    left join public.teacher_payroll_live_monthly v on v.teacher_id=t.id and v.payroll_month=v_month
    left join public.teacher_compensation_settings cs on cs.teacher_id=t.id
    where t.archived_at is null and coalesce(t.employment_status,'Active')<>'Inactive'
  loop
    select * into v_existing
    from public.teacher_payroll_statements
    where teacher_id=r.teacher_id and payroll_month=v_month;

    if v_existing.id is null then
      insert into public.teacher_payroll_statements(
        teacher_id,payroll_month,completed_hours,teaching_hours,ta_hours,
        tutoring_hours,group_hours,
        hourly_rate_snapshot,tutoring_rate_snapshot,group_rate_snapshot,ta_hourly_rate_snapshot,
        tutoring_amount,group_amount,teaching_amount,ta_amount,gross_amount
      ) values (
        r.teacher_id,v_month,r.completed_hours,r.teaching_hours,r.ta_hours,
        r.tutoring_hours,r.group_hours,
        r.hourly_rate,r.tutoring_rate,r.group_rate,r.ta_hourly_rate,
        r.tutoring_amount,r.group_amount,r.teaching_amount,r.ta_amount,r.gross_amount
      );
      v_count:=v_count+1;
    elsif v_existing.admin_status='Pending' and (
      p_force
      or v_existing.completed_hours<>r.completed_hours
      or v_existing.tutoring_hours<>r.tutoring_hours
      or v_existing.group_hours<>r.group_hours
      or v_existing.ta_hours<>r.ta_hours
      or v_existing.tutoring_rate_snapshot<>r.tutoring_rate
      or v_existing.group_rate_snapshot<>r.group_rate
      or v_existing.ta_hourly_rate_snapshot<>r.ta_hourly_rate
      or v_existing.gross_amount<>r.gross_amount
    ) then
      update public.teacher_payroll_statements set
        completed_hours=r.completed_hours,
        teaching_hours=r.teaching_hours,
        ta_hours=r.ta_hours,
        tutoring_hours=r.tutoring_hours,
        group_hours=r.group_hours,
        hourly_rate_snapshot=r.hourly_rate,
        tutoring_rate_snapshot=r.tutoring_rate,
        group_rate_snapshot=r.group_rate,
        ta_hourly_rate_snapshot=r.ta_hourly_rate,
        tutoring_amount=r.tutoring_amount,
        group_amount=r.group_amount,
        teaching_amount=r.teaching_amount,
        ta_amount=r.ta_amount,
        gross_amount=r.gross_amount,
        teacher_status='Pending review',
        teacher_note='Giờ Kèm/Nhóm/TA hoặc rate card đã thay đổi; vui lòng kiểm tra lại.',
        teacher_reviewed_at=null,
        generated_at=now(),
        updated_at=now()
      where id=v_existing.id;
      v_count:=v_count+1;
    end if;

    if r.user_id is not null then
      insert into public.notifications(recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata)
      values(
        r.user_id,'payroll_ready','Bảng lương tháng đã sẵn sàng',
        'Đã tổng kết riêng giờ Kèm, Nhóm và TA tháng '||to_char(v_month,'MM/YYYY')||'. Vui lòng kiểm tra.',
        '/payroll','High',
        'payroll-ready-v170:'||r.teacher_id::text||':'||v_month::text,
        jsonb_build_object('teacher_id',r.teacher_id,'payroll_month',v_month)
      )
      on conflict(dedupe_key) do nothing;
    end if;
  end loop;

  return v_count;
end;
$$;

create or replace function public.teacher_review_payroll(
  p_statement_id uuid,
  p_decision text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_teacher_id uuid;
  v_month date;
  v_live record;
begin
  if public.current_role()<>'teacher' then raise exception 'Teacher permission required'; end if;
  if p_decision not in ('Approved','Disputed') then raise exception 'Invalid payroll decision'; end if;

  select teacher_id,payroll_month into v_teacher_id,v_month
  from public.teacher_payroll_statements
  where id=p_statement_id and admin_status='Pending'
  for update;

  if v_teacher_id is null or v_teacher_id<>public.current_teacher_id() then
    raise exception 'Payroll statement not accessible';
  end if;

  if p_decision='Approved' then
    select * into v_live
    from public.teacher_payroll_live_monthly
    where teacher_id=v_teacher_id and payroll_month=v_month;

    update public.teacher_payroll_statements set
      completed_hours=coalesce(v_live.completed_hours,0),
      teaching_hours=coalesce(v_live.teaching_hours,0),
      ta_hours=coalesce(v_live.ta_hours,0),
      tutoring_hours=coalesce(v_live.tutoring_hours,0),
      group_hours=coalesce(v_live.group_hours,0),
      hourly_rate_snapshot=coalesce(v_live.group_rate,0),
      tutoring_rate_snapshot=coalesce(v_live.tutoring_rate,0),
      group_rate_snapshot=coalesce(v_live.group_rate,0),
      ta_hourly_rate_snapshot=coalesce(v_live.ta_hourly_rate,0),
      tutoring_amount=coalesce(v_live.tutoring_amount,0),
      group_amount=coalesce(v_live.group_amount,0),
      teaching_amount=coalesce(v_live.teaching_amount,0),
      ta_amount=coalesce(v_live.ta_amount,0),
      gross_amount=coalesce(v_live.estimated_payroll,0),
      teacher_status='Approved',
      teacher_note=null,
      teacher_reviewed_at=now(),
      updated_at=now()
    where id=p_statement_id;
  else
    update public.teacher_payroll_statements set
      teacher_status='Disputed',
      teacher_note=nullif(trim(coalesce(p_note,'')),''),
      teacher_reviewed_at=now(),
      updated_at=now()
    where id=p_statement_id;
  end if;
end;
$$;

-- Indexes that keep the class-size lookup inexpensive.
create index if not exists idx_enrollments_class_dates
  on public.enrollments(class_id,start_date,end_date)
  where archived_at is null;

commit;
