-- ZE CenterOS v1.2.4
-- Enforce valid teacher hourly-rate range: 50,000–1,500,000 VND.
-- Zero remains allowed only as the legacy/unconfigured state.

begin;

-- Remove the original broad check and replace it with the production range.
alter table public.teacher_compensation_settings
  drop constraint if exists teacher_compensation_settings_hourly_rate_check;

alter table public.teacher_compensation_settings
  add constraint teacher_compensation_settings_hourly_rate_check
  check (hourly_rate = 0 or hourly_rate between 50000 and 1500000);

-- Keep the legacy teachers.hourly_rate mirror consistent as well.
alter table public.teachers
  drop constraint if exists teachers_hourly_rate_range_check;

alter table public.teachers
  add constraint teachers_hourly_rate_range_check
  check (hourly_rate = 0 or hourly_rate between 50000 and 1500000);

create or replace function public.update_teacher_compensation_rate(
  p_teacher_id uuid,
  p_hourly_rate numeric,
  p_effective_from date default current_date,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  if p_hourly_rate is null or p_hourly_rate < 50000 or p_hourly_rate > 1500000 then
    raise exception 'Đơn giá giờ dạy phải từ 50.000đ đến 1.500.000đ mỗi giờ';
  end if;

  insert into public.teacher_compensation_settings(
    teacher_id,hourly_rate,effective_from,note,updated_by
  ) values(
    p_teacher_id,p_hourly_rate,coalesce(p_effective_from,current_date),
    nullif(trim(coalesce(p_note,'')),''),auth.uid()
  )
  on conflict(teacher_id) do update set
    hourly_rate=excluded.hourly_rate,
    effective_from=excluded.effective_from,
    note=excluded.note,
    updated_by=auth.uid(),
    updated_at=now();

  update public.teachers
  set hourly_rate=p_hourly_rate,updated_at=now()
  where id=p_teacher_id;

  update public.teacher_payroll_statements ps set
    hourly_rate_snapshot=p_hourly_rate,
    gross_amount=round(ps.completed_hours*p_hourly_rate,2),
    teacher_status=case when ps.teacher_status='Approved' then 'Pending review' else ps.teacher_status end,
    teacher_reviewed_at=case when ps.teacher_status='Approved' then null else ps.teacher_reviewed_at end,
    teacher_note=case when ps.teacher_status='Approved'
      then 'Đơn giá được Admin cập nhật; vui lòng kiểm tra và xác nhận lại.'
      else ps.teacher_note end,
    updated_at=now()
  where ps.teacher_id=p_teacher_id and ps.admin_status='Pending';
end;
$$;

revoke all on function public.update_teacher_compensation_rate(uuid,numeric,date,text) from public,anon;
grant execute on function public.update_teacher_compensation_rate(uuid,numeric,date,text) to authenticated;

commit;
