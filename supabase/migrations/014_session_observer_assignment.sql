-- ZE CenterOS v1.4.9
-- Optional Observer assignment for a specific teaching session.
-- Observer is NOT a teacher payroll role and is intentionally stored separately
-- from session_teachers.

begin;

create table if not exists public.session_observers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  observer_user_id uuid not null references auth.users(id) on delete restrict,
  observer_name text not null,
  note text,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_session_observers_user
  on public.session_observers(observer_user_id);

create index if not exists idx_session_observers_session
  on public.session_observers(session_id);

alter table public.session_observers enable row level security;

drop policy if exists session_observers_select on public.session_observers;
create policy session_observers_select
on public.session_observers
for select
to authenticated
using (
  public.current_role() in ('admin','academic_manager')
  or observer_user_id = auth.uid()
  or public.teacher_has_session(session_id)
);

drop policy if exists session_observers_insert on public.session_observers;
create policy session_observers_insert
on public.session_observers
for insert
to authenticated
with check (
  public.current_role() in ('admin','academic_manager')
  and assigned_by = auth.uid()
);

drop policy if exists session_observers_update on public.session_observers;
create policy session_observers_update
on public.session_observers
for update
to authenticated
using (public.current_role() in ('admin','academic_manager'))
with check (public.current_role() in ('admin','academic_manager'));

drop policy if exists session_observers_delete on public.session_observers;
create policy session_observers_delete
on public.session_observers
for delete
to authenticated
using (public.current_role() in ('admin','academic_manager'));

commit;
