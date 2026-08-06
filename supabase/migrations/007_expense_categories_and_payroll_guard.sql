-- ZE CenterOS v1.2.2
-- Expense category alignment from ZEST operating-cost workbook + payroll zero-value guard.
-- Safe to run more than once.

begin;

-- Keep "Nhóm chi phí" and "Loại chi phí" as separate fields, matching the
-- uploaded operating-cost workbook structure.
alter table public.expense_transactions
  add column if not exists cost_type text;

update public.expense_transactions et
set cost_type = coalesce(fc.group_name, 'Other')
from public.finance_categories fc
where et.category_id = fc.id
  and et.cost_type is null;

update public.expense_transactions
set cost_type = 'Other'
where cost_type is null;

alter table public.expense_transactions
  drop constraint if exists expense_transactions_cost_type_check;

alter table public.expense_transactions
  add constraint expense_transactions_cost_type_check
  check (cost_type in (
    'Fixed cost',
    'Variable cost',
    'Teacher payroll',
    'Staff payroll',
    'Commission',
    'Other'
  ));

alter table public.expense_transactions
  alter column cost_type set default 'Variable cost';

alter table public.expense_transactions
  alter column cost_type set not null;

create index if not exists idx_expenses_cost_type
  on public.expense_transactions(cost_type, expense_date);

-- Retire the short prototype list from new-entry forms. Historical rows remain
-- intact because categories are never deleted.
update public.finance_categories
set is_active = false,
    updated_at = now();

-- Exact operating-cost groups used in the ZEST July 2026 workbook.
insert into public.finance_categories(code, name, group_name, is_active) values
  ('PAYROLL_TEACHER',       'Lương giảng viên',             'Teacher payroll', true),
  ('PAYROLL_STAFF',         'Lương nhân sự vận hành',       'Staff payroll',   true),
  ('OPS_RENT',              'Thuê mặt bằng',                 'Fixed cost',      true),
  ('OPS_UTILITIES',         'Điện nước',                     'Variable cost',   true),
  ('OPS_SOFTWARE',          'Nền tảng / Phần mềm',          'Fixed cost',      true),
  ('OPS_MARKETING',         'Marketing',                     'Variable cost',   true),
  ('OPS_FACILITY_VPP',      'Cơ sở vật chất / VPP',         'Variable cost',   true),
  ('OPS_CLEANING',          'Vệ sinh / Tạp vụ',             'Fixed cost',      true),
  ('OPS_OUTSOURCED',        'Dịch vụ thuê ngoài',           'Fixed cost',      true),
  ('OPS_TAX_FEES',          'Thuế / Phí',                   'Fixed cost',      true),
  ('OPS_TRAINING_RECRUIT',  'Đào tạo & Tuyển dụng',         'Variable cost',   true),
  ('OPS_REFUND_SUPPORT',    'Hoàn tiền / Hỗ trợ HV',        'Variable cost',   true),
  ('OPS_OTHER',             'Chi phí khác',                  'Other',           true)
on conflict (code) do update set
  name = excluded.name,
  group_name = excluded.group_name,
  is_active = true,
  updated_at = now();

-- A real teacher rate must be positive. This avoids silent zero-payroll rows.
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
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if coalesce(p_hourly_rate,0) <= 0 then
    raise exception 'Vui lòng nhập đơn giá giờ dạy lớn hơn 0';
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

-- Replace payroll approval with friendly validation and correct cost type.
create or replace function public.admin_approve_teacher_payroll(
  p_statement_id uuid,
  p_admin_note text default null,
  p_mark_paid boolean default false
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_statement public.teacher_payroll_statements%rowtype;
  v_teacher public.teachers%rowtype;
  v_category_id uuid;
  v_expense_id uuid;
  v_source_key text;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;

  select * into v_statement
  from public.teacher_payroll_statements
  where id=p_statement_id
  for update;

  if v_statement.id is null then raise exception 'Payroll statement not found'; end if;
  if v_statement.teacher_status<>'Approved' then
    raise exception 'Giáo viên phải xác nhận bảng lương trước';
  end if;
  if coalesce(v_statement.completed_hours,0) <= 0 then
    raise exception 'Không thể duyệt lương vì số giờ hoàn thành đang bằng 0';
  end if;
  if coalesce(v_statement.hourly_rate_snapshot,0) <= 0 then
    raise exception 'Chưa thiết lập đơn giá giờ dạy cho giáo viên';
  end if;
  if coalesce(v_statement.gross_amount,0) <= 0 then
    raise exception 'Mức lương phải lớn hơn 0 trước khi ghi vào chi phí';
  end if;

  select * into v_teacher from public.teachers where id=v_statement.teacher_id;
  select id into v_category_id
  from public.finance_categories
  where code='PAYROLL_TEACHER' and is_active=true;

  if v_category_id is null then raise exception 'Teacher payroll category is missing'; end if;

  v_source_key:='teacher-payroll-statement:'||v_statement.id::text;

  insert into public.expense_transactions(
    category_id,cost_type,expense_date,amount,vendor,description,payment_method,status,
    teacher_id,payroll_month,source_key,created_by,approved_by,approved_at
  ) values(
    v_category_id,'Teacher payroll',(v_statement.payroll_month+interval '1 month - 1 day')::date,
    v_statement.gross_amount,v_teacher.full_name,
    'Lương GV '||v_teacher.full_name||' · '||v_statement.completed_hours||
      ' giờ × '||v_statement.hourly_rate_snapshot||' đ',
    'Payroll',case when p_mark_paid then 'Paid' else 'Approved' end,
    v_statement.teacher_id,v_statement.payroll_month,v_source_key,auth.uid(),auth.uid(),now()
  ) on conflict(source_key) do update set
    category_id=excluded.category_id,
    cost_type=excluded.cost_type,
    amount=excluded.amount,
    vendor=excluded.vendor,
    description=excluded.description,
    status=excluded.status,
    approved_by=auth.uid(),
    approved_at=now(),
    archived_at=null,
    archived_by=null,
    updated_at=now()
  returning id into v_expense_id;

  update public.teacher_payroll_statements set
    admin_status=case when p_mark_paid then 'Paid' else 'Approved' end,
    admin_note=nullif(trim(coalesce(p_admin_note,'')),''),
    admin_approved_by=auth.uid(),
    admin_approved_at=now(),
    expense_transaction_id=v_expense_id,
    locked_at=now(),
    updated_at=now()
  where id=p_statement_id;

  if v_teacher.user_id is not null then
    insert into public.notifications(
      recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata
    ) values(
      v_teacher.user_id,'payroll_admin_approved','Bảng lương đã được Admin duyệt',
      'Bảng lương tháng '||to_char(v_statement.payroll_month,'MM/YYYY')||
        ' đã được duyệt. Mức lương: '||
        to_char(v_statement.gross_amount,'FM999G999G999G990')||' VNĐ.',
      '/payroll','High','payroll-admin-approved:'||p_statement_id::text,
      jsonb_build_object('statement_id',p_statement_id,'amount',v_statement.gross_amount)
    ) on conflict(dedupe_key) do nothing;
  end if;

  return v_expense_id;
end;
$$;

revoke all on function public.update_teacher_compensation_rate(uuid,numeric,date,text) from public,anon;
revoke all on function public.admin_approve_teacher_payroll(uuid,text,boolean) from public,anon;
grant execute on function public.update_teacher_compensation_rate(uuid,numeric,date,text) to authenticated;
grant execute on function public.admin_approve_teacher_payroll(uuid,text,boolean) to authenticated;

commit;
