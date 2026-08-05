-- ZE CenterOS v1.2.0
-- Finance, expense accounting, printable receipts and in-app notifications.
-- Safe to run more than once.

begin;

create sequence if not exists public.finance_receipt_seq start with 1 increment by 1;

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  group_name text not null check (group_name in ('Fixed cost','Variable cost','Teacher payroll','Staff payroll','Commission','Other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_transactions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.finance_categories(id) on delete restrict,
  expense_date date not null default current_date,
  amount numeric(16,2) not null check (amount > 0),
  vendor text,
  description text not null,
  payment_method text,
  reference text,
  status text not null default 'Paid' check (status in ('Draft','Approved','Paid','Void')),
  teacher_id uuid references public.teachers(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  payroll_month date,
  source_key text unique,
  receipt_url text,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id)
);

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  payment_transaction_id uuid not null unique references public.payment_transactions(id) on delete restrict,
  tuition_account_id uuid not null references public.tuition_accounts(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  payer_name text not null,
  package_name text not null,
  amount numeric(16,2) not null check (amount > 0),
  payment_method text,
  reference text,
  note text,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references auth.users(id),
  status text not null default 'Issued' check (status in ('Issued','Voided')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  action_url text,
  priority text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  status text not null default 'Unread' check (status in ('Unread','Read','Archived')),
  scheduled_at timestamptz,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  created_by uuid references auth.users(id),
  dedupe_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_date on public.expense_transactions(expense_date);
create index if not exists idx_expenses_category on public.expense_transactions(category_id);
create index if not exists idx_expenses_teacher on public.expense_transactions(teacher_id);
create index if not exists idx_receipts_student on public.payment_receipts(student_id);
create index if not exists idx_notifications_recipient_unread on public.notifications(recipient_user_id, status, created_at desc);
create index if not exists idx_notifications_student on public.notifications(student_id, created_at desc);

insert into public.finance_categories(code,name,group_name) values
  ('FIXED_RENT','Thuê mặt bằng','Fixed cost'),
  ('FIXED_ELECTRICITY','Điện','Fixed cost'),
  ('FIXED_WATER','Nước','Fixed cost'),
  ('FIXED_INTERNET','Internet','Fixed cost'),
  ('FIXED_PLATFORM','Nền tảng và phần mềm','Fixed cost'),
  ('FIXED_OFFICE','Văn phòng và thiết bị','Fixed cost'),
  ('VARIABLE_MARKETING','Marketing và quảng cáo','Variable cost'),
  ('VARIABLE_MATERIALS','Giáo trình và học liệu','Variable cost'),
  ('VARIABLE_EVENT','Sự kiện và hoạt động','Variable cost'),
  ('VARIABLE_TRAVEL','Di chuyển và công tác','Variable cost'),
  ('VARIABLE_REFUND','Hoàn phí','Variable cost'),
  ('PAYROLL_TEACHER','Lương giáo viên','Teacher payroll'),
  ('PAYROLL_STAFF','Lương nhân sự','Staff payroll'),
  ('COMMISSION_SALES','Hoa hồng Sales/CSKH','Commission'),
  ('OTHER','Chi phí khác','Other')
on conflict (code) do update set name=excluded.name, group_name=excluded.group_name, is_active=true;

create or replace function public.next_finance_receipt_no()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'PT-' || to_char(current_date,'YYYYMM') || '-' || lpad(nextval('public.finance_receipt_seq')::text,6,'0')
$$;

create or replace function public.create_receipt_and_payment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_student_user_id uuid;
  v_student_name text;
  v_package_name text;
  v_receipt_no text;
begin
  select ta.student_id, s.user_id, s.full_name, ta.package_name
  into v_student_id, v_student_user_id, v_student_name, v_package_name
  from public.tuition_accounts ta
  join public.students s on s.id = ta.student_id
  where ta.id = new.tuition_account_id;

  insert into public.payment_receipts(
    receipt_no,payment_transaction_id,tuition_account_id,student_id,payer_name,package_name,
    amount,payment_method,reference,note,issued_at,issued_by
  ) values (
    public.next_finance_receipt_no(),new.id,new.tuition_account_id,v_student_id,v_student_name,v_package_name,
    new.amount,new.method,new.reference,new.note,new.paid_at,new.created_by
  )
  on conflict (payment_transaction_id) do update set
    amount=excluded.amount,
    payment_method=excluded.payment_method,
    reference=excluded.reference,
    note=excluded.note,
    issued_at=excluded.issued_at,
    updated_at=now()
  returning receipt_no into v_receipt_no;

  insert into public.notifications(
    recipient_user_id,student_id,kind,title,body,action_url,priority,created_by,dedupe_key,metadata
  ) values (
    v_student_user_id,v_student_id,'payment_received','Đã ghi nhận học phí',
    'Trung tâm đã ghi nhận ' || to_char(new.amount,'FM999G999G999G990') || ' VNĐ cho gói ' || v_package_name || '. Phiếu thu: ' || v_receipt_no || '.',
    '/finance/receipts/' || new.id,'High',new.created_by,'payment:' || new.id::text,
    jsonb_build_object('payment_id',new.id,'receipt_no',v_receipt_no,'amount',new.amount)
  ) on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists payment_receipt_notification on public.payment_transactions;
create trigger payment_receipt_notification
after insert on public.payment_transactions
for each row execute procedure public.create_receipt_and_payment_notification();

create or replace function public.sync_receipt_after_payment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.payment_receipts set
    amount=new.amount,
    payment_method=new.method,
    reference=new.reference,
    note=new.note,
    issued_at=new.paid_at,
    updated_at=now()
  where payment_transaction_id=new.id;
  return new;
end;
$$;

drop trigger if exists payment_receipt_sync on public.payment_transactions;
create trigger payment_receipt_sync
after update on public.payment_transactions
for each row execute procedure public.sync_receipt_after_payment_update();

-- Backfill printable receipts for payments already imported before v1.2.0.
insert into public.payment_receipts(
  receipt_no,payment_transaction_id,tuition_account_id,student_id,payer_name,package_name,
  amount,payment_method,reference,note,issued_at,issued_by
)
select
  public.next_finance_receipt_no(),pt.id,pt.tuition_account_id,ta.student_id,s.full_name,ta.package_name,
  pt.amount,pt.method,pt.reference,pt.note,pt.paid_at,pt.created_by
from public.payment_transactions pt
join public.tuition_accounts ta on ta.id=pt.tuition_account_id
join public.students s on s.id=ta.student_id
left join public.payment_receipts pr on pr.payment_transaction_id=pt.id
where pr.id is null;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set status='Read', read_at=coalesce(read_at,now())
  where id=p_notification_id
    and (recipient_user_id=auth.uid() or student_id=public.current_student_id());
  if not found then raise exception 'Notification not found or not accessible'; end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.notifications
  set status='Read', read_at=coalesce(read_at,now())
  where status='Unread'
    and (recipient_user_id=auth.uid() or student_id=public.current_student_id());
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.send_student_finance_notification(
  p_student_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_action_url text default '/finance',
  p_priority text default 'Normal',
  p_dedupe_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_user_id uuid;
begin
  if public.current_role() not in ('admin','customer_service') then
    raise exception 'Finance notification permission required';
  end if;
  select user_id into v_user_id from public.students where id=p_student_id and archived_at is null;
  insert into public.notifications(recipient_user_id,student_id,kind,title,body,action_url,priority,created_by,dedupe_key)
  values(v_user_id,p_student_id,p_kind,p_title,p_body,p_action_url,p_priority,auth.uid(),p_dedupe_key)
  on conflict (dedupe_key) do update set
    title=excluded.title, body=excluded.body, priority=excluded.priority, sent_at=now(), status='Unread', read_at=null
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.generate_renewal_notifications(p_days integer default 14)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_count integer := 0;
begin
  if public.current_role() not in ('admin','customer_service') then
    raise exception 'Finance notification permission required';
  end if;
  for r in
    select ta.id account_id,ta.student_id,ta.package_name,ta.renewal_due_date,ta.balance_amount,s.user_id,s.full_name
    from public.tuition_accounts ta
    join public.students s on s.id=ta.student_id
    where ta.archived_at is null
      and ta.renewal_due_date between current_date and current_date + greatest(p_days,0)
      and ta.status <> 'Closed'
  loop
    insert into public.notifications(recipient_user_id,student_id,kind,title,body,action_url,priority,created_by,dedupe_key,metadata)
    values(
      r.user_id,r.student_id,'renewal_due','Sắp đến kỳ tái phí',
      'Gói ' || r.package_name || ' dự kiến tái phí vào ' || to_char(r.renewal_due_date,'DD/MM/YYYY') ||
      case when r.balance_amount > 0 then '. Số tiền còn lại: ' || to_char(r.balance_amount,'FM999G999G999G990') || ' VNĐ.' else '.' end,
      '/finance','High',auth.uid(),'renewal:' || r.account_id::text || ':' || r.renewal_due_date::text,
      jsonb_build_object('tuition_account_id',r.account_id,'renewal_due_date',r.renewal_due_date,'balance_amount',r.balance_amount)
    ) on conflict (dedupe_key) do update set
      body=excluded.body,sent_at=now(),status='Unread',read_at=null,metadata=excluded.metadata;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.recalculate_tuition_usage_for_class(p_class_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tuition_accounts ta
  set used_hours = coalesce((
      select sum(s.duration_hours)
      from public.sessions s
      where s.class_id=e.class_id
        and s.archived_at is null
        and s.status in ('Completed','Make-up completed')
    ),0),
    updated_at=now()
  from public.enrollments e
  where ta.enrollment_id=e.id and e.class_id=p_class_id and ta.archived_at is null
$$;

create or replace function public.recalculate_tuition_usage_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then perform public.recalculate_tuition_usage_for_class(old.class_id); end if;
  if tg_op <> 'DELETE' then perform public.recalculate_tuition_usage_for_class(new.class_id); end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists sessions_recalculate_tuition_usage on public.sessions;
create trigger sessions_recalculate_tuition_usage
after insert or update or delete on public.sessions
for each row execute procedure public.recalculate_tuition_usage_trigger();

-- Initial usage calculation for all existing classes.
do $$ declare r record; begin
  for r in select id from public.classes loop
    perform public.recalculate_tuition_usage_for_class(r.id);
  end loop;
end $$;

create or replace view public.teacher_payroll_monthly with (security_invoker=true) as
select
  t.id teacher_id,
  t.code teacher_code,
  t.full_name teacher_name,
  date_trunc('month',s.scheduled_date)::date payroll_month,
  round(sum(s.duration_hours * st.payroll_factor),2) completed_hours,
  t.hourly_rate,
  round(sum(s.duration_hours * st.payroll_factor * t.hourly_rate),2) estimated_payroll
from public.teachers t
join public.session_teachers st on st.teacher_id=t.id
join public.sessions s on s.id=st.session_id
where s.archived_at is null and s.status in ('Completed','Make-up completed')
group by t.id,t.code,t.full_name,date_trunc('month',s.scheduled_date)::date,t.hourly_rate;

alter table public.finance_categories enable row level security;
alter table public.expense_transactions enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.notifications enable row level security;

drop policy if exists finance_categories_select on public.finance_categories;
create policy finance_categories_select on public.finance_categories for select to authenticated
using (public.current_role() in ('admin','customer_service'));
drop policy if exists finance_categories_admin on public.finance_categories;
create policy finance_categories_admin on public.finance_categories for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists expenses_admin_select on public.expense_transactions;
create policy expenses_admin_select on public.expense_transactions for select to authenticated using (public.is_admin());
drop policy if exists expenses_admin_insert on public.expense_transactions;
create policy expenses_admin_insert on public.expense_transactions for insert to authenticated with check (public.is_admin());
drop policy if exists expenses_admin_update on public.expense_transactions;
create policy expenses_admin_update on public.expense_transactions for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists expenses_admin_delete on public.expense_transactions;
create policy expenses_admin_delete on public.expense_transactions for delete to authenticated using (public.is_admin());

drop policy if exists receipts_select on public.payment_receipts;
create policy receipts_select on public.payment_receipts for select to authenticated
using (public.current_role() in ('admin','customer_service') or student_id=public.current_student_id());
drop policy if exists receipts_admin_update on public.payment_receipts;
create policy receipts_admin_update on public.payment_receipts for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
using (recipient_user_id=auth.uid() or student_id=public.current_student_id() or public.current_role() in ('admin','customer_service'));
drop policy if exists notifications_manage on public.notifications;
create policy notifications_manage on public.notifications for all to authenticated
using (public.current_role() in ('admin','customer_service'))
with check (public.current_role() in ('admin','customer_service'));

-- Audit and updated_at triggers.
drop trigger if exists set_updated_at_finance_categories on public.finance_categories;
create trigger set_updated_at_finance_categories before update on public.finance_categories
for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_expense_transactions on public.expense_transactions;
create trigger set_updated_at_expense_transactions before update on public.expense_transactions
for each row execute procedure public.set_updated_at();
drop trigger if exists set_updated_at_payment_receipts on public.payment_receipts;
create trigger set_updated_at_payment_receipts before update on public.payment_receipts
for each row execute procedure public.set_updated_at();


drop trigger if exists audit_finance_categories on public.finance_categories;
create trigger audit_finance_categories after insert or update or delete on public.finance_categories
for each row execute procedure public.audit_row_change();
drop trigger if exists audit_expense_transactions on public.expense_transactions;
create trigger audit_expense_transactions after insert or update or delete on public.expense_transactions
for each row execute procedure public.audit_row_change();
drop trigger if exists audit_payment_receipts on public.payment_receipts;
create trigger audit_payment_receipts after insert or update or delete on public.payment_receipts
for each row execute procedure public.audit_row_change();
drop trigger if exists audit_notifications on public.notifications;
create trigger audit_notifications after insert or update or delete on public.notifications
for each row execute procedure public.audit_row_change();

commit;
