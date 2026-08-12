-- ZE CenterOS v1.4.7
-- Staff Operations Handbook + database-backed Daily Work Log
-- Restricted to Khang, Thinh, Mai and Admin.

begin;

create table if not exists public.staff_daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  staff_email text not null,
  staff_name text not null,
  work_date date not null,
  check_in_actual time,
  check_out_actual time,
  outcome_1 text,
  outcome_2 text,
  outcome_3 text,
  completed_today text,
  open_risks_handover text,
  delay_sla_breach text,
  tomorrow_priorities text,
  status text not null default 'Draft' check (status in ('Draft','Submitted')),
  submitted_at timestamptz,
  manager_status text not null default 'Pending' check (manager_status in ('Pending','Reviewed','Needs follow-up')),
  manager_note text,
  manager_reviewed_by uuid references auth.users(id),
  manager_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, work_date)
);

create index if not exists idx_staff_daily_logs_date on public.staff_daily_logs(work_date desc);
create index if not exists idx_staff_daily_logs_user on public.staff_daily_logs(user_id, work_date desc);
create index if not exists idx_staff_daily_logs_manager on public.staff_daily_logs(manager_status, work_date desc);

create table if not exists public.staff_accountability_logs (
  id uuid primary key default gen_random_uuid(),
  incident_date date not null default current_date,
  staff_user_id uuid references public.profiles(id) on delete set null,
  staff_email text,
  staff_name text not null,
  incident text not null,
  severity text not null check (severity in ('Level 1','Level 2','Level 3')),
  impact text,
  corrective_action text,
  deadline date,
  status text not null default 'Open' check (status in ('Open','Monitoring','Closed')),
  manager_note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_accountability_date on public.staff_accountability_logs(incident_date desc);
create index if not exists idx_staff_accountability_staff on public.staff_accountability_logs(staff_email, incident_date desc);

alter table public.staff_daily_logs enable row level security;
alter table public.staff_accountability_logs enable row level security;

drop policy if exists staff_daily_logs_select on public.staff_daily_logs;
create policy staff_daily_logs_select on public.staff_daily_logs
for select to authenticated
using (
  public.is_admin()
  or (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt()->>'email','')) in ('khangaca@gmail.com','thinhaca@gmail.com','studentcare@gmail.com')
  )
);

drop policy if exists staff_daily_logs_insert on public.staff_daily_logs;
create policy staff_daily_logs_insert on public.staff_daily_logs
for insert to authenticated
with check (
  user_id = auth.uid()
  and lower(coalesce(auth.jwt()->>'email','')) in ('khangaca@gmail.com','thinhaca@gmail.com','studentcare@gmail.com')
);

drop policy if exists staff_daily_logs_update on public.staff_daily_logs;
create policy staff_daily_logs_update on public.staff_daily_logs
for update to authenticated
using (
  public.is_admin()
  or (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt()->>'email','')) in ('khangaca@gmail.com','thinhaca@gmail.com','studentcare@gmail.com')
  )
)
with check (
  public.is_admin()
  or (
    user_id = auth.uid()
    and lower(coalesce(auth.jwt()->>'email','')) in ('khangaca@gmail.com','thinhaca@gmail.com','studentcare@gmail.com')
  )
);

drop policy if exists staff_daily_logs_delete on public.staff_daily_logs;
create policy staff_daily_logs_delete on public.staff_daily_logs
for delete to authenticated using (public.is_admin());

drop policy if exists staff_accountability_select on public.staff_accountability_logs;
create policy staff_accountability_select on public.staff_accountability_logs
for select to authenticated using (public.is_admin());

drop policy if exists staff_accountability_insert on public.staff_accountability_logs;
create policy staff_accountability_insert on public.staff_accountability_logs
for insert to authenticated with check (public.is_admin());

drop policy if exists staff_accountability_update on public.staff_accountability_logs;
create policy staff_accountability_update on public.staff_accountability_logs
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists staff_accountability_delete on public.staff_accountability_logs;
create policy staff_accountability_delete on public.staff_accountability_logs
for delete to authenticated using (public.is_admin());

drop trigger if exists set_updated_at_staff_daily_logs on public.staff_daily_logs;
create trigger set_updated_at_staff_daily_logs
before update on public.staff_daily_logs
for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at_staff_accountability_logs on public.staff_accountability_logs;
create trigger set_updated_at_staff_accountability_logs
before update on public.staff_accountability_logs
for each row execute procedure public.set_updated_at();

drop trigger if exists audit_staff_daily_logs on public.staff_daily_logs;
create trigger audit_staff_daily_logs
after insert or update or delete on public.staff_daily_logs
for each row execute procedure public.audit_row_change();

drop trigger if exists audit_staff_accountability_logs on public.staff_accountability_logs;
create trigger audit_staff_accountability_logs
after insert or update or delete on public.staff_accountability_logs
for each row execute procedure public.audit_row_change();

commit;
