-- ZE CenterOS v1.6.2
-- Strict check-in payroll + timesheet consistency + legacy receipt cleanup

begin;

-- ------------------------------------------------------------------
-- Payroll rule:
-- Only a teacher with BOTH valid Check-in and Check-out is paid.
-- Session status is not used as a second blocker anymore.
-- Cancelled/archived sessions never count.
-- This also makes Admin-approved overrides immediately payable.
-- ------------------------------------------------------------------
create or replace view public.teacher_payroll_live_monthly with (security_invoker=true) as
select
  t.id teacher_id,
  t.code teacher_code,
  t.full_name teacher_name,
  date_trunc('month',s.scheduled_date)::date payroll_month,
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
left join public.teacher_compensation_settings cs on cs.teacher_id=t.id
join public.teacher_session_checkins ci
  on ci.session_id=s.id
 and ci.teacher_id=t.id
 and ci.check_in_at is not null
 and ci.check_out_at is not null
where t.archived_at is null
  and s.archived_at is null
  and s.status<>'Cancelled'
  and ci.check_out_at >= ((s.scheduled_date+s.end_time) at time zone 'Asia/Ho_Chi_Minh')
      - ((select checkout_early_tolerance_minutes from public.workforce_settings where id=1)*interval '1 minute')
group by
  t.id,t.code,t.full_name,date_trunc('month',s.scheduled_date)::date,
  cs.hourly_rate,cs.ta_hourly_rate;

-- ------------------------------------------------------------------
-- When Teacher approves payroll, refresh the Pending statement from
-- the live timesheet first. This prevents approval of stale hours.
-- ------------------------------------------------------------------
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
      hourly_rate_snapshot=coalesce(v_live.teaching_rate,0),
      ta_hourly_rate_snapshot=coalesce(v_live.ta_hourly_rate,0),
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

  insert into public.notifications(recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata)
  select p.id,'payroll_teacher_review',
    case when p_decision='Approved' then 'Giáo viên đã xác nhận bảng lương' else 'Giáo viên báo sai lệch bảng lương' end,
    'Bảng lương tháng '||to_char(v_month,'MM/YYYY')||' vừa được giáo viên cập nhật.',
    '/payroll','High','payroll-review-v162:'||p_statement_id::text||':'||p_decision||':'||p.id::text,
    jsonb_build_object('statement_id',p_statement_id,'decision',p_decision)
  from public.profiles p
  where p.role='admin' and p.is_active=true
  on conflict(dedupe_key) do nothing;
end;
$$;

-- ------------------------------------------------------------------
-- Clean legacy "+1 dong" payment bug only.
-- Examples: 9,500,001 -> 9,500,000; 4,500,001 -> 4,500,000.
-- Existing payment triggers recalculate tuition balances.
-- ------------------------------------------------------------------
update public.payment_transactions
set amount=round(amount/1000.0)*1000
where amount>=1000
  and mod(amount::bigint,1000)=1;

commit;
