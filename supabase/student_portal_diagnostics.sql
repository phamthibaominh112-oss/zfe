-- Student portal diagnostic: replace email when checking another learner.
with target_student as (
  select s.id, s.code, s.full_name, s.email
  from public.students s
  where lower(coalesce(s.email, '')) = lower('hongminh@mail.com')
     or s.code = 'STU-HONG-MINH'
  limit 1
)
select 'student' as dataset, ts.code as reference, ts.full_name as label,
       null::text as status, null::date as event_date
from target_student ts
union all
select 'enrollment', c.code, c.name, e.status, e.start_date
from target_student ts
join public.enrollments e on e.student_id = ts.id and e.archived_at is null
join public.classes c on c.id = e.class_id
union all
select 'session', c.code || ' #' || se.session_no::text,
       se.start_time::text || '–' || se.end_time::text,
       se.status::text, se.scheduled_date
from target_student ts
join public.enrollments e on e.student_id = ts.id and e.archived_at is null
join public.sessions se on se.class_id = e.class_id and se.archived_at is null
join public.classes c on c.id = e.class_id
order by event_date nulls first, dataset, reference;

-- Data domains that cannot appear until records exist.
select
  (select count(*) from public.assignments a join public.enrollments e on e.class_id=a.class_id join target_student ts on ts.id=e.student_id where a.published_at is not null) as published_assignments,
  (select count(*) from public.progress_feedback f join public.enrollments e on e.id=f.enrollment_id join target_student ts on ts.id=e.student_id where f.status='Published') as published_feedback,
  (select count(*) from public.attendance a join target_student ts on ts.id=a.student_id) as attendance_records,
  (select count(*) from public.tuition_accounts t join target_student ts on ts.id=t.student_id) as tuition_accounts;
