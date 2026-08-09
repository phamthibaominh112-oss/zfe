-- ZE CenterOS v1.3.4
-- 1) Cancelled sessions do not consume the visible lesson number.
-- 2) Standard teaching team = 1 Main teacher + optional 1 Assistant (TA).

begin;

alter table public.sessions
  drop constraint if exists sessions_class_id_session_no_key;

drop index if exists public.uq_sessions_active_class_session_no;

create unique index uq_sessions_active_class_session_no
  on public.sessions(class_id, session_no)
  where archived_at is null and status <> 'Cancelled';

comment on index public.uq_sessions_active_class_session_no is
'Lesson numbers are unique for active/non-cancelled sessions only. Cancelled records remain for audit and do not consume lesson numbering.';

create index if not exists idx_class_teachers_class_role
  on public.class_teachers(class_id, role);

create index if not exists idx_session_teachers_session_role
  on public.session_teachers(session_id, role);

commit;
