-- ZE CenterOS v1.6.1
-- Teacher Check-in Override Request -> Admin Approval workflow

begin;

create table if not exists public.teacher_checkin_override_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  requested_check_in_at timestamptz not null,
  requested_check_out_at timestamptz,
  reason text not null,
  status text not null default 'Pending'
    check (status in ('Pending','Approved','Rejected','Cancelled')),
  admin_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_teacher_override_requests_status
  on public.teacher_checkin_override_requests(status,created_at desc);

create index if not exists idx_teacher_override_requests_teacher
  on public.teacher_checkin_override_requests(teacher_id,created_at desc);

-- one unresolved request per teacher/session
create unique index if not exists uq_teacher_override_request_pending
  on public.teacher_checkin_override_requests(session_id,teacher_id)
  where status='Pending';

alter table public.teacher_checkin_override_requests enable row level security;

drop policy if exists teacher_override_requests_select on public.teacher_checkin_override_requests;
create policy teacher_override_requests_select
on public.teacher_checkin_override_requests
for select
to authenticated
using (
  public.is_admin()
  or requested_by=auth.uid()
);

drop policy if exists teacher_override_requests_insert on public.teacher_checkin_override_requests;
create policy teacher_override_requests_insert
on public.teacher_checkin_override_requests
for insert
to authenticated
with check (
  public.current_role()='teacher'
  and requested_by=auth.uid()
  and teacher_id=public.current_teacher_id()
  and public.teacher_has_session(session_id)
);

drop policy if exists teacher_override_requests_update on public.teacher_checkin_override_requests;
create policy teacher_override_requests_update
on public.teacher_checkin_override_requests
for update
to authenticated
using (
  public.is_admin()
  or (requested_by=auth.uid() and status='Pending')
)
with check (
  public.is_admin()
  or requested_by=auth.uid()
);

drop policy if exists admin_superuser_all on public.teacher_checkin_override_requests;
create policy admin_superuser_all
on public.teacher_checkin_override_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- atomic approval: apply check-in override + close request
create or replace function public.admin_approve_teacher_override_request(
  p_request_id uuid,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.teacher_checkin_override_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin permission required';
  end if;

  select * into r
  from public.teacher_checkin_override_requests
  where id=p_request_id
  for update;

  if r.id is null then raise exception 'Override request not found'; end if;
  if r.status<>'Pending' then raise exception 'Request is no longer Pending'; end if;

  perform public.admin_override_teacher_checkin(
    r.session_id,
    r.teacher_id,
    r.requested_check_in_at,
    r.requested_check_out_at,
    'Approved teacher request: '||r.reason
  );

  update public.teacher_checkin_override_requests
  set status='Approved',
      admin_note=nullif(trim(p_admin_note),''),
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      updated_at=now()
  where id=p_request_id;
end;
$$;

grant execute on function public.admin_approve_teacher_override_request(uuid,text) to authenticated;

create or replace function public.admin_reject_teacher_override_request(
  p_request_id uuid,
  p_admin_note text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin permission required'; end if;
  if coalesce(trim(p_admin_note),'')='' then raise exception 'Admin note is required'; end if;

  update public.teacher_checkin_override_requests
  set status='Rejected',
      admin_note=p_admin_note,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      updated_at=now()
  where id=p_request_id and status='Pending';

  if not found then raise exception 'Pending request not found'; end if;
end;
$$;

grant execute on function public.admin_reject_teacher_override_request(uuid,text) to authenticated;

commit;
