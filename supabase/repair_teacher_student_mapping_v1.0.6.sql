-- ZE CenterOS v1.0.6
-- Repair and verify Teacher <-> Class <-> Student relationships.
-- Safe to run more than once. No DELETE statements.

begin;

-- 1) Re-commit relationship data from staging tables when they still exist.
do $$
begin
  if to_regclass('public.import_enrollments') is not null then
    insert into public.enrollments(student_id,class_id,start_date,end_date,status,target)
    select st.id,c.id,s.start_date,s.end_date,s.status,nullif(s.target,'')
    from public.import_enrollments s
    join public.students st on st.code=s.student_code
    join public.classes c on c.code=s.class_code
    on conflict(student_id,class_id) do update set
      start_date=excluded.start_date,
      end_date=excluded.end_date,
      status=excluded.status,
      target=excluded.target,
      archived_at=null,
      updated_at=now();
  end if;

  if to_regclass('public.import_class_teachers') is not null then
    insert into public.class_teachers(class_id,teacher_id,role,payroll_factor)
    select c.id,t.id,s.role,s.payroll_factor
    from public.import_class_teachers s
    join public.classes c on c.code=s.class_code
    join public.teachers t on t.code=s.teacher_code
    on conflict(class_id,teacher_id,role) do update set
      payroll_factor=excluded.payroll_factor;
  end if;

  if to_regclass('public.import_session_teachers') is not null then
    insert into public.session_teachers(session_id,teacher_id,role,payroll_factor)
    select se.id,t.id,s.role,s.payroll_factor
    from public.import_session_teachers s
    join public.classes c on c.code=s.class_code
    join public.sessions se on se.class_id=c.id and se.session_no=s.session_no
    join public.teachers t on t.code=s.teacher_code
    on conflict(session_id,teacher_id,role) do update set
      payroll_factor=excluded.payroll_factor;
  end if;
end $$;

-- 2) A teacher assigned to any session must also be assigned at class level.
-- Choose the highest-priority role seen for that teacher in that class.
with observed as (
  select
    s.class_id,
    st.teacher_id,
    case min(case st.role
      when 'Main teacher' then 1
      when 'Co-teacher' then 2
      when 'Assistant' then 3
      when 'Cover' then 4
      else 9 end)
      when 1 then 'Main teacher'
      when 2 then 'Co-teacher'
      when 3 then 'Assistant'
      else 'Cover'
    end as resolved_role,
    max(st.payroll_factor) as payroll_factor
  from public.session_teachers st
  join public.sessions s on s.id=st.session_id
  where s.archived_at is null
  group by s.class_id, st.teacher_id
)
insert into public.class_teachers(class_id,teacher_id,role,payroll_factor)
select class_id,teacher_id,resolved_role,payroll_factor
from observed
on conflict(class_id,teacher_id,role) do update set
  payroll_factor=excluded.payroll_factor;

-- 3) If a session has no teacher and its class has exactly one teacher,
-- copy that unique class teacher to the session.
with single_teacher_classes as (
  select class_id, min(teacher_id::text)::uuid as teacher_id,
         min(role) as role, max(payroll_factor) as payroll_factor
  from public.class_teachers
  group by class_id
  having count(distinct teacher_id)=1
)
insert into public.session_teachers(session_id,teacher_id,role,payroll_factor)
select s.id,ct.teacher_id,ct.role,ct.payroll_factor
from public.sessions s
join single_teacher_classes ct on ct.class_id=s.class_id
where s.archived_at is null
  and not exists(select 1 from public.session_teachers st where st.session_id=s.id)
on conflict(session_id,teacher_id,role) do nothing;

-- 4) Restore Auth links from exact email matches when a profile record exists
-- but user_id is still null. Existing non-null links are never overwritten.
update public.teachers t
set user_id=u.id, updated_at=now()
from auth.users u
where t.user_id is null
  and t.email is not null
  and lower(t.email)=lower(u.email);

update public.students s
set user_id=u.id, updated_at=now()
from auth.users u
where s.user_id is null
  and s.email is not null
  and lower(s.email)=lower(u.email);

commit;

-- RESULT 1: Full Student -> Class -> Teacher mapping.
select
  st.code as student_code,
  st.full_name as student_name,
  st.email as student_login,
  c.code as class_code,
  c.name as class_name,
  e.status as enrollment_status,
  t.code as teacher_code,
  t.full_name as teacher_name,
  t.email as teacher_login,
  ct.role as teacher_role
from public.enrollments e
join public.students st on st.id=e.student_id
join public.classes c on c.id=e.class_id
left join public.class_teachers ct on ct.class_id=c.id
left join public.teachers t on t.id=ct.teacher_id
where e.archived_at is null
order by st.full_name,c.code,t.full_name;

-- RESULT 2: Problems that still need manual review.
select 'student_without_auth_link' as issue, s.code as entity_code, s.full_name as entity_name, null::text as class_code
from public.students s
where s.archived_at is null and s.user_id is null
union all
select 'teacher_without_auth_link', t.code, t.full_name, null::text
from public.teachers t
where t.archived_at is null and t.user_id is null
union all
select 'enrolled_class_without_teacher', st.code, st.full_name, c.code
from public.enrollments e
join public.students st on st.id=e.student_id
join public.classes c on c.id=e.class_id
where e.archived_at is null
  and not exists(select 1 from public.class_teachers ct where ct.class_id=e.class_id)
union all
select 'teacher_class_without_students', t.code, t.full_name, c.code
from public.class_teachers ct
join public.teachers t on t.id=ct.teacher_id
join public.classes c on c.id=ct.class_id
where not exists(select 1 from public.enrollments e where e.class_id=ct.class_id and e.archived_at is null)
order by issue,entity_name,class_code;

-- RESULT 3: Expected Hồng Minh / Mr. Phong legacy mapping check.
select
  st.code as student_code,
  st.full_name as student_name,
  c.code as class_code,
  t.code as teacher_code,
  t.full_name as teacher_name,
  ct.role,
  (select count(*) from public.sessions s where s.class_id=c.id and s.archived_at is null) as sessions,
  (select count(*) from public.sessions s join public.session_teachers x on x.session_id=s.id where s.class_id=c.id and x.teacher_id=t.id) as teacher_sessions
from public.students st
join public.enrollments e on e.student_id=st.id and e.archived_at is null
join public.classes c on c.id=e.class_id
left join public.class_teachers ct on ct.class_id=c.id
left join public.teachers t on t.id=ct.teacher_id
where st.code='STU-HONG-MINH';
