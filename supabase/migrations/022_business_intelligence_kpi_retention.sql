-- ZE CenterOS v1.9.0
-- Business Intelligence: KPI settings, viewer grants, learner status history

begin;

create table if not exists public.business_kpi_settings (
  id smallint primary key default 1 check (id=1),
  monthly_revenue_target numeric(16,2) not null default 150000000 check(monthly_revenue_target>=0),
  monthly_new_students_target integer not null default 10 check(monthly_new_students_target>=0),
  monthly_profit_target numeric(16,2) not null default 70000000 check(monthly_profit_target>=0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.business_kpi_settings(id,monthly_revenue_target,monthly_new_students_target,monthly_profit_target)
values(1,150000000,10,70000000)
on conflict(id) do nothing;

create table if not exists public.business_intelligence_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_level text not null default 'Viewer' check(access_level in ('Viewer','Owner')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now()
);

create table if not exists public.student_status_history (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id)
);

create index if not exists idx_student_status_history_student_date
  on public.student_status_history(student_id,changed_at desc);

create or replace function public.capture_student_status_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='INSERT' then
    insert into public.student_status_history(student_id,old_status,new_status,changed_at,changed_by)
    values(new.id,null,new.status,coalesce(new.updated_at,now()),auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.student_status_history(student_id,old_status,new_status,changed_at,changed_by)
    values(new.id,old.status,new.status,coalesce(new.updated_at,now()),auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_status_history on public.students;
create trigger trg_student_status_history
after insert or update of status on public.students
for each row execute function public.capture_student_status_change();

-- Seed one opening status record for pre-existing students.
insert into public.student_status_history(student_id,old_status,new_status,changed_at)
select s.id,null,s.status,coalesce(s.updated_at,s.created_at,now())
from public.students s
where not exists (
  select 1 from public.student_status_history h where h.student_id=s.id
);

alter table public.business_kpi_settings enable row level security;
alter table public.business_intelligence_access enable row level security;
alter table public.student_status_history enable row level security;

drop policy if exists bi_kpi_admin_select on public.business_kpi_settings;
create policy bi_kpi_admin_select on public.business_kpi_settings
for select to authenticated using (
  public.is_admin()
  or exists(select 1 from public.business_intelligence_access a where a.user_id=auth.uid())
);

drop policy if exists bi_kpi_admin_write on public.business_kpi_settings;
create policy bi_kpi_admin_write on public.business_kpi_settings
for all to authenticated using (public.is_admin()) with check(public.is_admin());

drop policy if exists bi_access_self_select on public.business_intelligence_access;
create policy bi_access_self_select on public.business_intelligence_access
for select to authenticated using (public.is_admin() or user_id=auth.uid());

drop policy if exists bi_access_admin_write on public.business_intelligence_access;
create policy bi_access_admin_write on public.business_intelligence_access
for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists bi_status_history_select on public.student_status_history;
create policy bi_status_history_select on public.student_status_history
for select to authenticated using (
  public.is_admin()
  or exists(select 1 from public.business_intelligence_access a where a.user_id=auth.uid())
);

commit;
