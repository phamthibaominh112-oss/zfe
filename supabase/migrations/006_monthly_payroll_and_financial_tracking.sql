-- ZE CenterOS v1.2.1
-- Monthly teacher payroll review/approval, secure hourly rates and import-ready monthly financial tracking.
-- Safe to run more than once.

begin;

create table if not exists public.teacher_compensation_settings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null unique references public.teachers(id) on delete cascade,
  hourly_rate numeric(14,2) not null default 0 check (hourly_rate >= 0),
  effective_from date not null default current_date,
  note text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep legacy rates as the initial value, but all new payroll calculations use this protected table.
insert into public.teacher_compensation_settings(teacher_id,hourly_rate,effective_from,note)
select id,coalesce(hourly_rate,0),current_date,'Migrated from teachers.hourly_rate'
from public.teachers
where archived_at is null
on conflict (teacher_id) do nothing;

create table if not exists public.teacher_payroll_statements (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  payroll_month date not null check (extract(day from payroll_month)=1),
  completed_hours numeric(10,2) not null default 0 check (completed_hours >= 0),
  hourly_rate_snapshot numeric(14,2) not null default 0 check (hourly_rate_snapshot >= 0),
  gross_amount numeric(16,2) not null default 0 check (gross_amount >= 0),
  teacher_status text not null default 'Pending review' check (teacher_status in ('Pending review','Approved','Disputed')),
  teacher_note text,
  teacher_reviewed_at timestamptz,
  admin_status text not null default 'Pending' check (admin_status in ('Pending','Approved','Paid','Void')),
  admin_note text,
  admin_approved_by uuid references auth.users(id),
  admin_approved_at timestamptz,
  expense_transaction_id uuid unique references public.expense_transactions(id) on delete set null,
  generated_at timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(teacher_id,payroll_month)
);

create index if not exists idx_teacher_payroll_statements_month on public.teacher_payroll_statements(payroll_month,admin_status);
create index if not exists idx_teacher_payroll_statements_teacher on public.teacher_payroll_statements(teacher_id,payroll_month desc);

create table if not exists public.monthly_financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month)=1),
  revenue_amount numeric(16,2) not null default 0,
  fixed_cost_amount numeric(16,2) not null default 0,
  variable_cost_amount numeric(16,2) not null default 0,
  teacher_payroll_amount numeric(16,2) not null default 0,
  staff_payroll_amount numeric(16,2) not null default 0,
  commission_amount numeric(16,2) not null default 0,
  other_cost_amount numeric(16,2) not null default 0,
  source text not null default 'Manual import',
  note text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Staging table designed for direct CSV upload later.
create table if not exists public.import_monthly_financial_snapshots (
  month text,
  revenue_amount numeric,
  fixed_cost_amount numeric,
  variable_cost_amount numeric,
  teacher_payroll_amount numeric,
  staff_payroll_amount numeric,
  commission_amount numeric,
  other_cost_amount numeric,
  source text,
  note text
);

create or replace view public.monthly_financial_balance with (security_invoker=true) as
select
  id,month,revenue_amount,fixed_cost_amount,variable_cost_amount,
  teacher_payroll_amount,staff_payroll_amount,commission_amount,other_cost_amount,
  (fixed_cost_amount+variable_cost_amount+teacher_payroll_amount+staff_payroll_amount+commission_amount+other_cost_amount) as total_expense,
  (revenue_amount-(fixed_cost_amount+variable_cost_amount+teacher_payroll_amount+staff_payroll_amount+commission_amount+other_cost_amount)) as operating_result,
  source,note,created_at,updated_at
from public.monthly_financial_snapshots;

create or replace view public.teacher_payroll_live_monthly with (security_invoker=true) as
select
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
left join public.teacher_compensation_settings cs on cs.teacher_id=t.id
where t.archived_at is null
  and s.archived_at is null
  and s.status in ('Completed','Make-up completed')
group by t.id,t.code,t.full_name,date_trunc('month',s.scheduled_date)::date,cs.hourly_rate;

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
  if p_hourly_rate < 0 then raise exception 'Hourly rate must be zero or greater'; end if;

  insert into public.teacher_compensation_settings(teacher_id,hourly_rate,effective_from,note,updated_by)
  values(p_teacher_id,p_hourly_rate,coalesce(p_effective_from,current_date),nullif(trim(coalesce(p_note,'')),''),auth.uid())
  on conflict(teacher_id) do update set
    hourly_rate=excluded.hourly_rate,
    effective_from=excluded.effective_from,
    note=excluded.note,
    updated_by=auth.uid(),
    updated_at=now();

  -- Maintain the legacy column for backwards compatibility with existing exports.
  update public.teachers set hourly_rate=p_hourly_rate,updated_at=now() where id=p_teacher_id;

  -- Refresh only payrolls that have not been approved by Admin.
  update public.teacher_payroll_statements ps set
    hourly_rate_snapshot=p_hourly_rate,
    gross_amount=round(ps.completed_hours*p_hourly_rate,2),
    teacher_status=case when ps.teacher_status='Approved' then 'Pending review' else ps.teacher_status end,
    teacher_reviewed_at=case when ps.teacher_status='Approved' then null else ps.teacher_reviewed_at end,
    teacher_note=case when ps.teacher_status='Approved' then 'Đơn giá được Admin cập nhật; vui lòng kiểm tra và xác nhận lại.' else ps.teacher_note end,
    updated_at=now()
  where ps.teacher_id=p_teacher_id and ps.admin_status='Pending';
end;
$$;

create or replace function public.generate_teacher_payroll_statements(
  p_month date,
  p_force boolean default false
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_month date := date_trunc('month',p_month)::date;
  v_count integer := 0;
  r record;
  v_existing public.teacher_payroll_statements%rowtype;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Admin permission required'; end if;

  for r in
    select
      t.id teacher_id,
      t.user_id,
      t.full_name,
      coalesce(round(sum(s.duration_hours*st.payroll_factor) filter (
        where s.scheduled_date>=v_month
          and s.scheduled_date<(v_month+interval '1 month')::date
          and s.status in ('Completed','Make-up completed')
          and s.archived_at is null
      ),2),0) completed_hours,
      coalesce(cs.hourly_rate,0) hourly_rate
    from public.teachers t
    left join public.teacher_compensation_settings cs on cs.teacher_id=t.id
    left join public.session_teachers st on st.teacher_id=t.id
    left join public.sessions s on s.id=st.session_id
    where t.archived_at is null and coalesce(t.employment_status,'Active')<>'Inactive'
    group by t.id,t.user_id,t.full_name,cs.hourly_rate
  loop
    select * into v_existing from public.teacher_payroll_statements
    where teacher_id=r.teacher_id and payroll_month=v_month;

    if v_existing.id is null then
      insert into public.teacher_payroll_statements(
        teacher_id,payroll_month,completed_hours,hourly_rate_snapshot,gross_amount
      ) values(
        r.teacher_id,v_month,r.completed_hours,r.hourly_rate,round(r.completed_hours*r.hourly_rate,2)
      );
      v_count:=v_count+1;
    elsif v_existing.admin_status='Pending' and (p_force or
      v_existing.completed_hours<>r.completed_hours or
      v_existing.hourly_rate_snapshot<>r.hourly_rate) then
      update public.teacher_payroll_statements set
        completed_hours=r.completed_hours,
        hourly_rate_snapshot=r.hourly_rate,
        gross_amount=round(r.completed_hours*r.hourly_rate,2),
        teacher_status='Pending review',
        teacher_note='Dữ liệu giờ dạy hoặc đơn giá đã thay đổi; vui lòng kiểm tra lại.',
        teacher_reviewed_at=null,
        generated_at=now(),
        updated_at=now()
      where id=v_existing.id;
      v_count:=v_count+1;
    end if;

    if r.user_id is not null then
      insert into public.notifications(
        recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata
      ) values(
        r.user_id,'payroll_ready','Bảng lương tháng đã sẵn sàng',
        'Hệ thống đã tổng kết giờ dạy tháng '||to_char(v_month,'MM/YYYY')||'. Vui lòng kiểm tra và xác nhận.',
        '/payroll','High','payroll-ready:'||r.teacher_id::text||':'||v_month::text,
        jsonb_build_object('teacher_id',r.teacher_id,'payroll_month',v_month)
      ) on conflict(dedupe_key) do nothing;
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
declare v_teacher_id uuid; v_month date;
begin
  if public.current_role()<>'teacher' then raise exception 'Teacher permission required'; end if;
  if p_decision not in ('Approved','Disputed') then raise exception 'Invalid payroll decision'; end if;

  select teacher_id,payroll_month into v_teacher_id,v_month
  from public.teacher_payroll_statements where id=p_statement_id;
  if v_teacher_id is null or v_teacher_id<>public.current_teacher_id() then raise exception 'Payroll statement not accessible'; end if;

  update public.teacher_payroll_statements set
    teacher_status=p_decision,
    teacher_note=nullif(trim(coalesce(p_note,'')),''),
    teacher_reviewed_at=now(),
    updated_at=now()
  where id=p_statement_id and admin_status='Pending';
  if not found then raise exception 'Payroll has already been approved or is unavailable'; end if;

  insert into public.notifications(recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata)
  select p.id,'payroll_teacher_review',
    case when p_decision='Approved' then 'Giáo viên đã xác nhận bảng lương' else 'Giáo viên báo sai lệch bảng lương' end,
    'Bảng lương tháng '||to_char(v_month,'MM/YYYY')||' vừa được giáo viên cập nhật.',
    '/payroll','High','payroll-review:'||p_statement_id::text||':'||p_decision||':'||p.id::text,
    jsonb_build_object('statement_id',p_statement_id,'decision',p_decision)
  from public.profiles p where p.role='admin' and p.is_active=true
  on conflict(dedupe_key) do nothing;
end;
$$;

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

  select * into v_statement from public.teacher_payroll_statements where id=p_statement_id for update;
  if v_statement.id is null then raise exception 'Payroll statement not found'; end if;
  if v_statement.teacher_status<>'Approved' then raise exception 'Teacher must approve the payroll first'; end if;

  select * into v_teacher from public.teachers where id=v_statement.teacher_id;
  select id into v_category_id from public.finance_categories where code='PAYROLL_TEACHER';
  if v_category_id is null then raise exception 'Teacher payroll category is missing'; end if;

  v_source_key:='teacher-payroll-statement:'||v_statement.id::text;
  insert into public.expense_transactions(
    category_id,expense_date,amount,vendor,description,payment_method,status,
    teacher_id,payroll_month,source_key,created_by,approved_by,approved_at
  ) values(
    v_category_id,(v_statement.payroll_month+interval '1 month - 1 day')::date,
    v_statement.gross_amount,v_teacher.full_name,
    'Lương GV '||v_teacher.full_name||' · '||v_statement.completed_hours||' giờ × '||v_statement.hourly_rate_snapshot||' đ',
    'Payroll',case when p_mark_paid then 'Paid' else 'Approved' end,
    v_statement.teacher_id,v_statement.payroll_month,v_source_key,auth.uid(),auth.uid(),now()
  ) on conflict(source_key) do update set
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
    insert into public.notifications(recipient_user_id,kind,title,body,action_url,priority,dedupe_key,metadata)
    values(
      v_teacher.user_id,'payroll_admin_approved','Bảng lương đã được Admin duyệt',
      'Bảng lương tháng '||to_char(v_statement.payroll_month,'MM/YYYY')||' đã được duyệt. Mức lương: '||to_char(v_statement.gross_amount,'FM999G999G999G990')||' VNĐ.',
      '/payroll','High','payroll-admin-approved:'||p_statement_id::text,
      jsonb_build_object('statement_id',p_statement_id,'amount',v_statement.gross_amount)
    ) on conflict(dedupe_key) do nothing;
  end if;

  return v_expense_id;
end;
$$;

create or replace function public.admin_mark_teacher_payroll_paid(p_statement_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_expense_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  select expense_transaction_id into v_expense_id from public.teacher_payroll_statements where id=p_statement_id;
  if v_expense_id is null then raise exception 'Approve payroll before marking it paid'; end if;
  update public.expense_transactions set status='Paid',updated_at=now() where id=v_expense_id;
  update public.teacher_payroll_statements set admin_status='Paid',updated_at=now() where id=p_statement_id;
end;
$$;

create or replace function public.commit_monthly_financial_import()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_count integer;
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;

  insert into public.monthly_financial_snapshots(
    month,revenue_amount,fixed_cost_amount,variable_cost_amount,teacher_payroll_amount,
    staff_payroll_amount,commission_amount,other_cost_amount,source,note,created_by,updated_by
  )
  select
    date_trunc('month',month::date)::date,
    coalesce(revenue_amount,0),coalesce(fixed_cost_amount,0),coalesce(variable_cost_amount,0),
    coalesce(teacher_payroll_amount,0),coalesce(staff_payroll_amount,0),coalesce(commission_amount,0),
    coalesce(other_cost_amount,0),coalesce(nullif(source,''),'CSV import'),nullif(note,''),auth.uid(),auth.uid()
  from public.import_monthly_financial_snapshots
  where nullif(trim(month),'') is not null
  on conflict(month) do update set
    revenue_amount=excluded.revenue_amount,
    fixed_cost_amount=excluded.fixed_cost_amount,
    variable_cost_amount=excluded.variable_cost_amount,
    teacher_payroll_amount=excluded.teacher_payroll_amount,
    staff_payroll_amount=excluded.staff_payroll_amount,
    commission_amount=excluded.commission_amount,
    other_cost_amount=excluded.other_cost_amount,
    source=excluded.source,
    note=excluded.note,
    updated_by=auth.uid(),
    updated_at=now();

  get diagnostics v_count=row_count;
  truncate table public.import_monthly_financial_snapshots;
  return v_count;
end;
$$;

create or replace function public.run_month_end_payroll_job()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_local_date date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_target_month date;
begin
  if v_local_date=(date_trunc('month',v_local_date)+interval '1 month - 1 day')::date then
    v_target_month:=date_trunc('month',v_local_date)::date;
  elsif extract(day from v_local_date)=1 then
    v_target_month:=date_trunc('month',v_local_date-interval '1 day')::date;
  else
    return 0;
  end if;
  return public.generate_teacher_payroll_statements(v_target_month,true);
end;
$$;

alter table public.teacher_compensation_settings enable row level security;
alter table public.teacher_payroll_statements enable row level security;
alter table public.monthly_financial_snapshots enable row level security;
alter table public.import_monthly_financial_snapshots enable row level security;

drop policy if exists teacher_compensation_select on public.teacher_compensation_settings;
create policy teacher_compensation_select on public.teacher_compensation_settings for select to authenticated
using (public.is_admin() or teacher_id=public.current_teacher_id());
drop policy if exists teacher_compensation_admin on public.teacher_compensation_settings;
create policy teacher_compensation_admin on public.teacher_compensation_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists teacher_payroll_select on public.teacher_payroll_statements;
create policy teacher_payroll_select on public.teacher_payroll_statements for select to authenticated
using (public.is_admin() or teacher_id=public.current_teacher_id());
drop policy if exists teacher_payroll_admin_manage on public.teacher_payroll_statements;
create policy teacher_payroll_admin_manage on public.teacher_payroll_statements for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists monthly_financial_admin on public.monthly_financial_snapshots;
create policy monthly_financial_admin on public.monthly_financial_snapshots for all to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists import_monthly_financial_admin on public.import_monthly_financial_snapshots;
create policy import_monthly_financial_admin on public.import_monthly_financial_snapshots for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- Function permissions: authenticated users can call; each function enforces the exact role internally.
revoke all on function public.update_teacher_compensation_rate(uuid,numeric,date,text) from public,anon;
revoke all on function public.generate_teacher_payroll_statements(date,boolean) from public,anon;
revoke all on function public.teacher_review_payroll(uuid,text,text) from public,anon;
revoke all on function public.admin_approve_teacher_payroll(uuid,text,boolean) from public,anon;
revoke all on function public.admin_mark_teacher_payroll_paid(uuid) from public,anon;
revoke all on function public.commit_monthly_financial_import() from public,anon;
revoke all on function public.run_month_end_payroll_job() from public,anon,authenticated;
grant execute on function public.update_teacher_compensation_rate(uuid,numeric,date,text) to authenticated;
grant execute on function public.generate_teacher_payroll_statements(date,boolean) to authenticated;
grant execute on function public.teacher_review_payroll(uuid,text,text) to authenticated;
grant execute on function public.admin_approve_teacher_payroll(uuid,text,boolean) to authenticated;
grant execute on function public.admin_mark_teacher_payroll_paid(uuid) to authenticated;
grant execute on function public.commit_monthly_financial_import() to authenticated;

-- updated_at and audit trails.
drop trigger if exists set_updated_at_teacher_compensation on public.teacher_compensation_settings;
create trigger set_updated_at_teacher_compensation before update on public.teacher_compensation_settings
for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_teacher_payroll_statements on public.teacher_payroll_statements;
create trigger set_updated_at_teacher_payroll_statements before update on public.teacher_payroll_statements
for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_monthly_financial_snapshots on public.monthly_financial_snapshots;
create trigger set_updated_at_monthly_financial_snapshots before update on public.monthly_financial_snapshots
for each row execute procedure public.set_updated_at();

drop trigger if exists audit_teacher_compensation on public.teacher_compensation_settings;
create trigger audit_teacher_compensation after insert or update or delete on public.teacher_compensation_settings
for each row execute procedure public.audit_row_change();
drop trigger if exists audit_teacher_payroll_statements on public.teacher_payroll_statements;
create trigger audit_teacher_payroll_statements after insert or update or delete on public.teacher_payroll_statements
for each row execute procedure public.audit_row_change();
drop trigger if exists audit_monthly_financial_snapshots on public.monthly_financial_snapshots;
create trigger audit_monthly_financial_snapshots after insert or update or delete on public.monthly_financial_snapshots
for each row execute procedure public.audit_row_change();

commit;

-- Optional automatic month-end generation via Supabase Cron.
-- Runs daily at 23:55 Vietnam time; the function only acts on the last day or first day of a month.
do $$
declare v_job_id bigint;
begin
  create extension if not exists pg_cron;
  select jobid into v_job_id from cron.job where jobname='ze-centeros-month-end-payroll' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'ze-centeros-month-end-payroll',
    '55 16 * * *',
    'select public.run_month_end_payroll_job();'
  );
exception when others then
  raise notice 'Supabase Cron was not enabled automatically: %. Use the manual Generate button or enable Cron from Integrations.',sqlerrm;
end $$;
