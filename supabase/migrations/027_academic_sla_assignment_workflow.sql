-- ZE CenterOS v2.3.0
-- Academic SLA: attendance 24h, assignment 24h, homework deadline <=7d,
-- grading <=7d after assignment deadline, late submission evidence,
-- structured grading and student notifications.
begin;

create table if not exists public.learning_workflow_settings (
  id smallint primary key default 1 check(id=1),
  effective_from date not null default date '2026-09-01',
  attendance_deadline_hours integer not null default 24 check(attendance_deadline_hours between 1 and 168),
  assignment_publish_deadline_hours integer not null default 24 check(assignment_publish_deadline_hours between 1 and 168),
  assignment_due_days integer not null default 7 check(assignment_due_days between 1 and 30),
  grading_deadline_days integer not null default 7 check(grading_deadline_days between 1 and 30),
  student_due_alert_hours integer not null default 48 check(student_due_alert_hours between 1 and 168),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.learning_workflow_settings(id) values(1) on conflict(id) do nothing;

alter table public.assignments
  add column if not exists skill_category text,
  add column if not exists rubric_note text;

do $$ begin
  alter table public.assignments
    add constraint assignments_skill_category_check
    check(skill_category is null or skill_category in ('Listening','Reading','Writing','Speaking','Grammar','Vocabulary','Integrated','Other'));
exception when duplicate_object then null; end $$;

alter table public.assignment_submissions
  add column if not exists is_late boolean not null default false,
  add column if not exists late_by_minutes integer not null default 0,
  add column if not exists feedback_strengths text,
  add column if not exists feedback_errors text,
  add column if not exists correction_guidance text,
  add column if not exists next_steps text,
  add column if not exists rubric_scores jsonb not null default '{}'::jsonb,
  add column if not exists returned_at timestamptz;

create or replace function public.stamp_assignment_submission_lateness()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_due timestamptz;
  v_submitted timestamptz;
begin
  select due_at into v_due from public.assignments where id=new.assignment_id;
  v_submitted=coalesce(new.submitted_at,now());
  if v_due is not null and v_submitted>v_due then
    new.is_late=true;
    new.late_by_minutes=greatest(0,floor(extract(epoch from (v_submitted-v_due))/60)::integer);
  else
    new.is_late=false;
    new.late_by_minutes=0;
  end if;
  return new;
end $$;

drop trigger if exists trg_assignment_submission_lateness on public.assignment_submissions;
create trigger trg_assignment_submission_lateness
before insert or update of submitted_at,assignment_id
on public.assignment_submissions
for each row execute function public.stamp_assignment_submission_lateness();

-- Student receives an in-app notification when a published assignment becomes available.
create or replace function public.notify_assignment_published()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare r record;
begin
  if new.published_at is null or (tg_op='UPDATE' and old.published_at is not null) then return new; end if;
  for r in
    select s.id student_id,s.user_id,s.full_name
    from public.enrollments e
    join public.students s on s.id=e.student_id
    where e.class_id=new.class_id and e.archived_at is null
      and e.status in ('Active','Paused')
      and s.user_id is not null and s.archived_at is null
  loop
    insert into public.notifications(recipient_user_id,student_id,kind,title,body,action_url,priority,dedupe_key,metadata)
    values(
      r.user_id,r.student_id,'assignment_published',
      'Bài tập mới đã được giao',
      new.title || case when new.due_at is not null then ' · Hạn '||to_char(new.due_at at time zone 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI') else '' end,
      '/dashboard','High',
      'assignment-published:'||new.id::text||':'||r.student_id::text,
      jsonb_build_object('assignment_id',new.id,'due_at',new.due_at,'skill_category',new.skill_category)
    )
    on conflict(dedupe_key) do nothing;
  end loop;
  return new;
end $$;

drop trigger if exists trg_notify_assignment_published on public.assignments;
create trigger trg_notify_assignment_published
after insert or update of published_at on public.assignments
for each row execute function public.notify_assignment_published();

-- Student receives an alert whenever the teacher returns a grade / revision request.
create or replace function public.notify_assignment_returned()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid; v_title text; v_max numeric;
begin
  if new.graded_at is null or (tg_op='UPDATE' and old.graded_at is not distinct from new.graded_at and old.status is not distinct from new.status) then
    return new;
  end if;
  select s.user_id into v_user from public.students s where s.id=new.student_id;
  select a.title,a.max_score into v_title,v_max from public.assignments a where a.id=new.assignment_id;
  new.returned_at=coalesce(new.returned_at,new.graded_at,now());
  if v_user is not null then
    insert into public.notifications(recipient_user_id,student_id,kind,title,body,action_url,priority,dedupe_key,metadata)
    values(
      v_user,new.student_id,'assignment_returned',
      case when new.status='Revision required' then 'GV yêu cầu bạn sửa bài' else 'GV đã trả bài & điểm' end,
      coalesce(v_title,'Assignment')||
        case when new.score is not null then ' · Điểm '||new.score::text||'/'||coalesce(v_max,100)::text else '' end,
      '/dashboard','High',
      'assignment-returned:'||new.id::text||':'||coalesce(new.graded_at,now())::date::text,
      jsonb_build_object('assignment_id',new.assignment_id,'submission_id',new.id,'score',new.score,'status',new.status)
    )
    on conflict(dedupe_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_assignment_returned on public.assignment_submissions;
create trigger trg_notify_assignment_returned
before update of graded_at,status on public.assignment_submissions
for each row execute function public.notify_assignment_returned();

-- Operational SLA view for each teaching session.
create or replace view public.teacher_academic_sla_dashboard with (security_invoker=true) as
with cfg as (
  select * from public.learning_workflow_settings where id=1
), base as (
  select
    st.teacher_id,t.user_id teacher_user_id,t.full_name teacher_name,st.role teacher_role,
    s.id session_id,s.class_id,s.session_no,s.scheduled_date,s.start_time,s.end_time,s.status session_status,
    c.code class_code,c.name class_name,
    ((s.scheduled_date+s.end_time) at time zone 'Asia/Ho_Chi_Minh') session_end_at,
    cfg.effective_from,cfg.attendance_deadline_hours,cfg.assignment_publish_deadline_hours,cfg.assignment_due_days,cfg.grading_deadline_days
  from public.session_teachers st
  join public.teachers t on t.id=st.teacher_id and t.archived_at is null
  join public.sessions s on s.id=st.session_id and s.archived_at is null
  join public.classes c on c.id=s.class_id
  cross join cfg
  where st.role in ('Main teacher','Cover','Co-teacher')
)
select
  b.*,
  b.session_end_at+(b.attendance_deadline_hours*interval '1 hour') attendance_deadline_at,
  b.session_end_at+(b.assignment_publish_deadline_hours*interval '1 hour') assignment_publish_deadline_at,
  coalesce(roster.roster_count,0) roster_count,
  coalesce(att.attendance_count,0) attendance_count,
  att.last_attendance_at,
  case when coalesce(roster.roster_count,0)=0 then true else coalesce(att.attendance_count,0)>=roster.roster_count end attendance_complete,
  case when att.last_attendance_at is null then false else att.last_attendance_at<=b.session_end_at+(b.attendance_deadline_hours*interval '1 hour') end attendance_on_time,
  a.assignment_id,a.assignment_title,a.skill_category,a.assignment_published_at,a.assignment_due_at,
  case when a.assignment_published_at is null then false else a.assignment_published_at<=b.session_end_at+(b.assignment_publish_deadline_hours*interval '1 hour') end assignment_on_time,
  case when a.assignment_due_at is null then false else a.assignment_due_at<=b.session_end_at+(b.assignment_due_days*interval '1 day') end due_date_compliant
from base b
left join lateral (
  select count(*)::integer roster_count
  from public.enrollments e
  where e.class_id=b.class_id and e.archived_at is null
    and (e.start_date is null or e.start_date<=b.scheduled_date)
    and (e.end_date is null or e.end_date>=b.scheduled_date)
) roster on true
left join lateral (
  select count(*)::integer attendance_count,max(a.marked_at) last_attendance_at
  from public.attendance a where a.session_id=b.session_id
) att on true
left join lateral (
  select x.id assignment_id,x.title assignment_title,x.skill_category,x.published_at assignment_published_at,x.due_at assignment_due_at
  from public.assignments x
  where x.session_id=b.session_id and x.archived_at is null
  order by x.published_at nulls last,x.created_at
  limit 1
) a on true
where b.scheduled_date>=b.effective_from;

-- Grading KPI now follows the requested rule: within 7 days AFTER assignment deadline.
create or replace view public.teacher_grading_compliance with (security_invoker=true) as
with cfg as (
  select grading_deadline_days,effective_from as teacher_checkin_effective_from
  from public.learning_workflow_settings where id=1
)
select
  t.id teacher_id,t.code teacher_code,t.full_name teacher_name,
  a.id assignment_id,a.session_id,s.scheduled_date,sub.id submission_id,sub.student_id,
  sub.submitted_at,sub.graded_at,sub.graded_by,
  (coalesce(a.due_at,sub.submitted_at)+(cfg.grading_deadline_days*interval '1 day')) grading_deadline_at,
  (now()>=coalesce(a.due_at,sub.submitted_at)+(cfg.grading_deadline_days*interval '1 day') or sub.graded_at is not null) grading_due,
  (sub.graded_at is not null and sub.graded_by=t.user_id and sub.graded_at<=coalesce(a.due_at,sub.submitted_at)+(cfg.grading_deadline_days*interval '1 day')) graded_on_time,
  a.due_at assignment_due_at
from public.assignments a
join public.sessions s on s.id=a.session_id and s.archived_at is null
join public.teachers t on t.user_id=a.created_by and t.archived_at is null
join public.assignment_submissions sub on sub.assignment_id=a.id
cross join cfg
where a.archived_at is null and a.published_at is not null
  and s.scheduled_date>=cfg.teacher_checkin_effective_from;

commit;
