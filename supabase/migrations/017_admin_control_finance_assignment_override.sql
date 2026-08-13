-- ZE CenterOS v1.6.0
-- Admin Control & Finance / Assignment / Check-in fixes

begin;

-- ------------------------------------------------------------
-- A. Admin is a real operational superuser
-- PostgreSQL RLS policies are permissive (OR), so these policies ensure
-- Admin is never accidentally blocked by a role-specific policy.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'students','teachers','classes','class_teachers','enrollments',
    'teacher_availability','student_availability','sessions','session_teachers',
    'attendance','homework_records','assignments','assignment_submissions',
    'assessments','assessment_results','progress_feedback',
    'teacher_observations','observation_scores','teacher_ratings',
    'tuition_accounts','payment_transactions','renewal_followups',
    'teacher_session_checkins','staff_work_schedules','staff_work_logs',
    'staff_compensation_settings','staff_payroll_statements',
    'session_observers','payment_receipts','notifications'
  ]
  loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists admin_superuser_all on public.%I', t);
      execute format(
        'create policy admin_superuser_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        t
      );
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- B. Teachers may edit/archive assignments they created.
-- Academic/Admin may manage every assignment.
-- ------------------------------------------------------------
drop policy if exists assignments_update on public.assignments;
create policy assignments_update
on public.assignments
for update
to authenticated
using (
  public.is_academic_manager()
  or (
    public.current_role()='teacher'
    and created_by=auth.uid()
    and public.teacher_operates_class(class_id)
    and (session_id is null or public.teacher_has_session(session_id))
  )
)
with check (
  public.is_academic_manager()
  or (
    public.current_role()='teacher'
    and created_by=auth.uid()
    and public.teacher_operates_class(class_id)
    and (session_id is null or public.teacher_has_session(session_id))
  )
);

-- Teacher hard-delete is intentionally NOT enabled.
-- App uses archived_at / archived_by so history and submissions are preserved.
-- Admin still has DELETE through admin_superuser_all.

-- CSKH may delete an incorrect payment transaction through the controlled RPC.
-- Keep direct table delete restricted to Admin to avoid accidental non-atomic deletion.

-- Receipt details may be edited by Admin / CSKH.
drop policy if exists receipts_manage_update on public.payment_receipts;
create policy receipts_manage_update
on public.payment_receipts
for update
to authenticated
using (public.current_role() in ('admin','customer_service'))
with check (public.current_role() in ('admin','customer_service'));

-- ------------------------------------------------------------
-- C. Atomic delete/void of payment + receipt.
-- Removing the payment triggers existing tuition recalculation.
-- Reports/dashboard revenue use payment_transactions, so revenue also decreases.
-- ------------------------------------------------------------
create or replace function public.delete_payment_and_receipt(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_role public.app_role;
begin
  v_role := public.current_role();
  if v_role not in ('admin','customer_service') then
    raise exception 'Admin/CSKH permission required';
  end if;
  if coalesce(trim(p_reason),'')='' then
    raise exception 'Delete reason is required';
  end if;
  if not exists(select 1 from public.payment_transactions where id=p_payment_id) then
    raise exception 'Payment not found';
  end if;

  -- Audit detail before deletion (existing row audit triggers will also run).
  insert into public.audit_logs(actor_id,action,table_name,record_id,new_data)
  values(
    auth.uid(),'DELETE_PAYMENT','payment_transactions',p_payment_id,
    jsonb_build_object('reason',p_reason)
  );

  delete from public.notifications
  where dedupe_key='payment:'||p_payment_id::text;

  delete from public.payment_receipts
  where payment_transaction_id=p_payment_id;

  -- Existing payment_recalculate trigger recalculates tuition account.
  delete from public.payment_transactions
  where id=p_payment_id;
end;
$$;

grant execute on function public.delete_payment_and_receipt(uuid,text) to authenticated;

-- ------------------------------------------------------------
-- D. Robust Admin override RPCs.
-- No service-role key needed. Functions explicitly require Admin.
-- ------------------------------------------------------------
create or replace function public.admin_override_teacher_checkin(
  p_session_id uuid,
  p_teacher_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_late integer := 0;
  v_early integer := 0;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Override reason is required'; end if;
  if p_check_in_at is null then raise exception 'Check-in time is required'; end if;
  if p_check_out_at is not null and p_check_out_at < p_check_in_at then
    raise exception 'Check-out cannot be before Check-in';
  end if;

  if not exists(
    select 1 from public.session_teachers
    where session_id=p_session_id and teacher_id=p_teacher_id
  ) then
    raise exception 'Teacher is not assigned to this session';
  end if;

  select
    (s.scheduled_date::text||' '||s.start_time::text||' Asia/Ho_Chi_Minh')::timestamptz,
    (s.scheduled_date::text||' '||s.end_time::text||' Asia/Ho_Chi_Minh')::timestamptz
  into v_start,v_end
  from public.sessions s where s.id=p_session_id;

  if v_start is null then raise exception 'Session not found'; end if;

  v_late := greatest(0, floor(extract(epoch from (p_check_in_at-v_start))/60)::integer);
  if p_check_out_at is not null then
    v_early := greatest(0, floor(extract(epoch from (v_end-p_check_out_at))/60)::integer);
  end if;

  insert into public.teacher_session_checkins(
    session_id,teacher_id,check_in_at,check_out_at,late_minutes,
    early_checkout_minutes,status,adjustment_note,adjusted_by
  ) values (
    p_session_id,p_teacher_id,p_check_in_at,p_check_out_at,v_late,
    v_early,'Adjusted',p_reason,auth.uid()
  )
  on conflict(session_id,teacher_id) do update set
    check_in_at=excluded.check_in_at,
    check_out_at=excluded.check_out_at,
    late_minutes=excluded.late_minutes,
    early_checkout_minutes=excluded.early_checkout_minutes,
    status='Adjusted',
    adjustment_note=excluded.adjustment_note,
    adjusted_by=auth.uid(),
    updated_at=now();
end;
$$;

grant execute on function public.admin_override_teacher_checkin(uuid,uuid,timestamptz,timestamptz,text) to authenticated;

create or replace function public.admin_override_staff_checkin(
  p_schedule_id uuid,
  p_check_in_at timestamptz,
  p_check_out_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_schedule public.staff_work_schedules%rowtype;
  v_start timestamptz;
  v_late integer := 0;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'Override reason is required'; end if;
  if p_check_in_at is null then raise exception 'Check-in time is required'; end if;
  if p_check_out_at is not null and p_check_out_at < p_check_in_at then
    raise exception 'Check-out cannot be before Check-in';
  end if;

  select * into v_schedule
  from public.staff_work_schedules
  where id=p_schedule_id;

  if v_schedule.id is null then raise exception 'Work schedule not found'; end if;

  v_start := (v_schedule.work_date::text||' '||v_schedule.start_time::text||' Asia/Ho_Chi_Minh')::timestamptz;
  v_late := greatest(0, floor(extract(epoch from (p_check_in_at-v_start))/60)::integer);

  insert into public.staff_work_logs(
    schedule_id,user_id,check_in_at,check_out_at,late_minutes,
    status,adjustment_note,adjusted_by
  ) values (
    p_schedule_id,v_schedule.user_id,p_check_in_at,p_check_out_at,v_late,
    'Adjusted',p_reason,auth.uid()
  )
  on conflict(schedule_id) do update set
    user_id=excluded.user_id,
    check_in_at=excluded.check_in_at,
    check_out_at=excluded.check_out_at,
    late_minutes=excluded.late_minutes,
    status='Adjusted',
    adjustment_note=excluded.adjustment_note,
    adjusted_by=auth.uid(),
    updated_at=now();
end;
$$;

grant execute on function public.admin_override_staff_checkin(uuid,timestamptz,timestamptz,text) to authenticated;

commit;
