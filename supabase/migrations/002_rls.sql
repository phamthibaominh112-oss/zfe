-- Role helpers and Row Level Security

create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and is_active = true $$;

create or replace function public.current_student_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.students where user_id = auth.uid() and archived_at is null and public.current_role() = 'student' limit 1 $$;

create or replace function public.current_teacher_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select id from public.teachers where user_id = auth.uid() and archived_at is null and public.current_role() = 'teacher' limit 1 $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() = 'admin', false) $$;

create or replace function public.is_academic_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() in ('admin','academic_manager'), false) $$;

create or replace function public.is_customer_service()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() in ('admin','customer_service'), false) $$;

create or replace function public.teacher_has_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.class_teachers ct where ct.class_id = p_class_id and ct.teacher_id = public.current_teacher_id())
$$;

create or replace function public.teacher_has_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.session_teachers st where st.session_id = p_session_id and st.teacher_id = public.current_teacher_id()
    union all
    select 1 from public.sessions s where s.id = p_session_id and public.teacher_has_class(s.class_id)
  )
$$;

create or replace function public.student_in_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.enrollments e where e.class_id = p_class_id and e.student_id = public.current_student_id() and e.archived_at is null)
$$;

create or replace function public.teacher_can_view_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.enrollments e
    join public.class_teachers ct on ct.class_id = e.class_id
    where e.student_id = p_student_id and ct.teacher_id = public.current_teacher_id() and e.archived_at is null
  )
$$;

create or replace function public.can_view_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_role() in ('admin','academic_manager','customer_service')
    or p_student_id = public.current_student_id()
    or public.teacher_can_view_student(p_student_id)
$$;

create or replace function public.can_view_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_role() in ('admin','academic_manager','customer_service')
    or public.teacher_has_class(p_class_id)
    or public.student_in_class(p_class_id)
$$;

create or replace function public.student_owns_enrollment(p_enrollment_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.enrollments where id = p_enrollment_id and student_id = public.current_student_id()) $$;

create or replace function public.teacher_can_manage_enrollment(p_enrollment_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.enrollments e where e.id = p_enrollment_id and public.teacher_has_class(e.class_id))
$$;

create or replace function public.can_view_assignment(p_assignment_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.assignments a where a.id = p_assignment_id and public.can_view_class(a.class_id)) $$;

create or replace function public.student_owns_submission(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select p_student_id = public.current_student_id() $$;

create or replace function public.student_belongs_to_session(p_student_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.sessions s
    join public.enrollments e on e.class_id = s.class_id
    where s.id = p_session_id and e.student_id = p_student_id and e.archived_at is null
  )
$$;

create or replace function public.teacher_is_on_session(p_teacher_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.session_teachers st where st.session_id = p_session_id and st.teacher_id = p_teacher_id)
    or exists(select 1 from public.sessions s join public.class_teachers ct on ct.class_id = s.class_id where s.id = p_session_id and ct.teacher_id = p_teacher_id)
$$;

create or replace function public.student_belongs_to_assessment(p_student_id uuid, p_assessment_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.assessments a
    join public.enrollments e on e.class_id = a.class_id
    where a.id = p_assessment_id and e.student_id = p_student_id and e.archived_at is null
  )
$$;

create or replace function public.resubmit_assignment(p_assignment_id uuid, p_file_path text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare sid uuid;
begin
  sid := public.current_student_id();
  if sid is null then raise exception 'Student role required'; end if;
  if not public.can_view_assignment(p_assignment_id) then raise exception 'Assignment not available'; end if;
  update public.assignment_submissions
  set file_path = p_file_path, status = 'Submitted', submitted_at = now(), score = null, feedback = null, graded_by = null, graded_at = null, updated_at = now()
  where assignment_id = p_assignment_id and student_id = sid and status = 'Revision required';
  if not found then raise exception 'Resubmission is not open'; end if;
end;
$$;

create or replace function public.complete_teaching_session(p_session_id uuid, p_topic text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not (public.is_academic_manager() or public.teacher_has_session(p_session_id)) then
    raise exception 'Not allowed to complete this session';
  end if;
  update public.sessions
  set status = 'Completed', completed_at = now(), topic = coalesce(nullif(trim(p_topic),''), topic), updated_at = now()
  where id = p_session_id;
  if not found then raise exception 'Session not found'; end if;
end;
$$;

create or replace function public.reschedule_session(
  p_session_id uuid, p_new_date date, p_new_start time, p_new_end time, p_reason text
) returns void
language plpgsql
security definer set search_path = public
as $$
declare old_row public.sessions%rowtype;
begin
  if not public.is_academic_manager() then raise exception 'Academic manager permission required'; end if;
  select * into old_row from public.sessions where id = p_session_id for update;
  if old_row.id is null then raise exception 'Session not found'; end if;
  insert into public.session_changes(session_id,old_date,new_date,old_start_time,new_start_time,old_end_time,new_end_time,reason,changed_by)
  values(p_session_id,old_row.scheduled_date,p_new_date,old_row.start_time,p_new_start,old_row.end_time,p_new_end,p_reason,auth.uid());
  update public.sessions set scheduled_date=p_new_date,start_time=p_new_start,end_time=p_new_end,status='Rescheduled',updated_at=now() where id=p_session_id;
end;
$$;

-- Enable RLS on every application table.
do $$
declare t text;
begin
  foreach t in array array['profiles','students','teachers','programs','levels','course_templates','classes','class_teachers','enrollments','teacher_availability','student_availability','sessions','session_teachers','session_changes','attendance','homework_records','assignments','assignment_submissions','assessments','assessment_results','progress_feedback','observation_templates','observation_criteria','teacher_observations','observation_scores','teacher_ratings','tuition_accounts','payment_transactions','renewal_followups','audit_logs']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- Profiles
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Students
create policy students_select on public.students for select to authenticated using (public.can_view_student(id));
create policy students_insert on public.students for insert to authenticated with check (public.current_role() in ('admin','academic_manager','customer_service'));
create policy students_update on public.students for update to authenticated using (public.current_role() in ('admin','academic_manager','customer_service')) with check (public.current_role() in ('admin','academic_manager','customer_service'));
create policy students_delete on public.students for delete to authenticated using (public.is_admin());

-- Teachers
create policy teachers_select on public.teachers for select to authenticated using (public.current_role() in ('admin','academic_manager') or id = public.current_teacher_id() or exists(select 1 from public.class_teachers ct where ct.teacher_id = id and public.student_in_class(ct.class_id)));
create policy teachers_insert on public.teachers for insert to authenticated with check (public.is_academic_manager());
create policy teachers_update on public.teachers for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy teachers_delete on public.teachers for delete to authenticated using (public.is_admin());

-- Academic catalog
create policy programs_select on public.programs for select to authenticated using (true);
create policy programs_manage on public.programs for insert to authenticated with check (public.is_academic_manager());
create policy programs_update on public.programs for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy programs_delete on public.programs for delete to authenticated using (public.is_admin());
create policy levels_select on public.levels for select to authenticated using (true);
create policy levels_manage on public.levels for insert to authenticated with check (public.is_academic_manager());
create policy levels_update on public.levels for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy levels_delete on public.levels for delete to authenticated using (public.is_admin());
create policy templates_select on public.course_templates for select to authenticated using (true);
create policy templates_manage on public.course_templates for insert to authenticated with check (public.is_academic_manager());
create policy templates_update on public.course_templates for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy templates_delete on public.course_templates for delete to authenticated using (public.is_admin());

-- Classes, assignments, enrollment
create policy classes_select on public.classes for select to authenticated using (public.can_view_class(id));
create policy classes_insert on public.classes for insert to authenticated with check (public.is_academic_manager());
create policy classes_update on public.classes for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy classes_delete on public.classes for delete to authenticated using (public.is_admin());

create policy class_teachers_select on public.class_teachers for select to authenticated using (public.can_view_class(class_id));
create policy class_teachers_insert on public.class_teachers for insert to authenticated with check (public.is_academic_manager());
create policy class_teachers_update on public.class_teachers for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy class_teachers_delete on public.class_teachers for delete to authenticated using (public.is_admin());

create policy enrollments_select on public.enrollments for select to authenticated using (public.current_role() in ('admin','academic_manager','customer_service') or public.teacher_has_class(class_id) or student_id = public.current_student_id());
create policy enrollments_insert on public.enrollments for insert to authenticated with check (public.is_academic_manager());
create policy enrollments_update on public.enrollments for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy enrollments_delete on public.enrollments for delete to authenticated using (public.is_admin());

-- Availability
create policy teacher_availability_select on public.teacher_availability for select to authenticated using (public.is_academic_manager() or teacher_id = public.current_teacher_id());
create policy teacher_availability_insert on public.teacher_availability for insert to authenticated with check (public.is_academic_manager() or teacher_id = public.current_teacher_id());
create policy teacher_availability_update on public.teacher_availability for update to authenticated using (public.is_academic_manager() or teacher_id = public.current_teacher_id()) with check (public.is_academic_manager() or teacher_id = public.current_teacher_id());
create policy teacher_availability_delete on public.teacher_availability for delete to authenticated using (public.is_academic_manager());

create policy student_availability_select on public.student_availability for select to authenticated using (public.current_role() in ('admin','academic_manager','customer_service') or student_id = public.current_student_id());
create policy student_availability_insert on public.student_availability for insert to authenticated with check (public.current_role() in ('admin','academic_manager','customer_service'));
create policy student_availability_update on public.student_availability for update to authenticated using (public.current_role() in ('admin','academic_manager','customer_service')) with check (public.current_role() in ('admin','academic_manager','customer_service'));
create policy student_availability_delete on public.student_availability for delete to authenticated using (public.is_admin());

-- Sessions
create policy sessions_select on public.sessions for select to authenticated using (public.can_view_class(class_id));
create policy sessions_insert on public.sessions for insert to authenticated with check (public.is_academic_manager());
create policy sessions_update on public.sessions for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy sessions_delete on public.sessions for delete to authenticated using (public.is_admin());

create policy session_teachers_select on public.session_teachers for select to authenticated using (public.teacher_has_session(session_id) or exists(select 1 from public.sessions s where s.id = session_id and public.can_view_class(s.class_id)));
create policy session_teachers_insert on public.session_teachers for insert to authenticated with check (public.is_academic_manager());
create policy session_teachers_update on public.session_teachers for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy session_teachers_delete on public.session_teachers for delete to authenticated using (public.is_academic_manager());

create policy session_changes_select on public.session_changes for select to authenticated using (exists(select 1 from public.sessions s where s.id = session_id and public.can_view_class(s.class_id)));
create policy session_changes_insert on public.session_changes for insert to authenticated with check (public.is_academic_manager());
create policy session_changes_delete on public.session_changes for delete to authenticated using (public.is_admin());

-- Attendance and homework: CSKH cannot read these rows.
create policy attendance_select on public.attendance for select to authenticated using (public.is_academic_manager() or public.teacher_has_session(session_id) or student_id = public.current_student_id());
create policy attendance_insert on public.attendance for insert to authenticated with check ((public.is_academic_manager() or public.teacher_has_session(session_id)) and public.student_belongs_to_session(student_id, session_id));
create policy attendance_update on public.attendance for update to authenticated using (public.is_academic_manager() or public.teacher_has_session(session_id)) with check ((public.is_academic_manager() or public.teacher_has_session(session_id)) and public.student_belongs_to_session(student_id, session_id));
create policy attendance_delete on public.attendance for delete to authenticated using (public.is_admin());

create policy homework_select on public.homework_records for select to authenticated using (public.is_academic_manager() or public.teacher_has_session(session_id) or student_id = public.current_student_id());
create policy homework_insert on public.homework_records for insert to authenticated with check ((public.is_academic_manager() or public.teacher_has_session(session_id)) and public.student_belongs_to_session(student_id, session_id));
create policy homework_update on public.homework_records for update to authenticated using (public.is_academic_manager() or public.teacher_has_session(session_id)) with check ((public.is_academic_manager() or public.teacher_has_session(session_id)) and public.student_belongs_to_session(student_id, session_id));
create policy homework_delete on public.homework_records for delete to authenticated using (public.is_admin());

-- Assignments
create policy assignments_select on public.assignments for select to authenticated using (public.can_view_class(class_id));
create policy assignments_insert on public.assignments for insert to authenticated with check (public.is_academic_manager() or public.teacher_has_class(class_id));
create policy assignments_update on public.assignments for update to authenticated using (public.is_academic_manager() or public.teacher_has_class(class_id)) with check (public.is_academic_manager() or public.teacher_has_class(class_id));
create policy assignments_delete on public.assignments for delete to authenticated using (public.is_admin());

create policy submissions_select on public.assignment_submissions for select to authenticated using (student_id = public.current_student_id() or public.is_academic_manager() or (public.current_role() = 'teacher' and public.can_view_assignment(assignment_id)));
create policy submissions_insert on public.assignment_submissions for insert to authenticated with check (student_id = public.current_student_id() and public.can_view_assignment(assignment_id));
create policy submissions_teacher_update on public.assignment_submissions for update to authenticated using (public.is_academic_manager() or (public.current_role() = 'teacher' and public.can_view_assignment(assignment_id))) with check (public.is_academic_manager() or (public.current_role() = 'teacher' and public.can_view_assignment(assignment_id)));
create policy submissions_delete on public.assignment_submissions for delete to authenticated using (public.is_admin());

-- Assessments: no CSKH access.
create policy assessments_select on public.assessments for select to authenticated using (public.is_academic_manager() or public.teacher_has_class(class_id) or public.student_in_class(class_id));
create policy assessments_insert on public.assessments for insert to authenticated with check (public.is_academic_manager() or public.teacher_has_class(class_id));
create policy assessments_update on public.assessments for update to authenticated using (public.is_academic_manager() or public.teacher_has_class(class_id)) with check (public.is_academic_manager() or public.teacher_has_class(class_id));
create policy assessments_delete on public.assessments for delete to authenticated using (public.is_admin());

create policy results_select on public.assessment_results for select to authenticated using (
  public.is_academic_manager()
  or exists(select 1 from public.assessments a where a.id = assessment_id and public.teacher_has_class(a.class_id))
  or (student_id = public.current_student_id() and published_at is not null)
);
create policy results_insert on public.assessment_results for insert to authenticated with check ((public.is_academic_manager() or exists(select 1 from public.assessments a where a.id = assessment_id and public.teacher_has_class(a.class_id))) and public.student_belongs_to_assessment(student_id, assessment_id));
create policy results_update on public.assessment_results for update to authenticated using (public.is_academic_manager() or exists(select 1 from public.assessments a where a.id = assessment_id and public.teacher_has_class(a.class_id))) with check ((public.is_academic_manager() or exists(select 1 from public.assessments a where a.id = assessment_id and public.teacher_has_class(a.class_id))) and public.student_belongs_to_assessment(student_id, assessment_id));
create policy results_delete on public.assessment_results for delete to authenticated using (public.is_admin());

-- Feedback workflow: teacher sees own assigned classes; student only published feedback; CSKH has no access.
create policy feedback_select on public.progress_feedback for select to authenticated using (
  public.is_academic_manager()
  or (public.current_role() = 'teacher' and public.teacher_can_manage_enrollment(enrollment_id))
  or (public.student_owns_enrollment(enrollment_id) and status = 'Published')
);
create policy feedback_insert on public.progress_feedback for insert to authenticated with check ((public.is_academic_manager() or (public.current_role() = 'teacher' and public.teacher_can_manage_enrollment(enrollment_id))) and submitted_by = auth.uid());
create policy feedback_teacher_update on public.progress_feedback for update to authenticated using (public.current_role() = 'teacher' and submitted_by = auth.uid() and status in ('Draft','Revision requested')) with check (public.teacher_can_manage_enrollment(enrollment_id));
create policy feedback_manager_update on public.progress_feedback for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy feedback_delete on public.progress_feedback for delete to authenticated using (public.is_admin());

-- Teacher quality
create policy observation_templates_select on public.observation_templates for select to authenticated using (public.current_role() in ('admin','academic_manager','teacher'));
create policy observation_templates_insert on public.observation_templates for insert to authenticated with check (public.is_academic_manager());
create policy observation_templates_update on public.observation_templates for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy observation_templates_delete on public.observation_templates for delete to authenticated using (public.is_admin());
create policy observation_criteria_select on public.observation_criteria for select to authenticated using (public.current_role() in ('admin','academic_manager','teacher'));
create policy observation_criteria_insert on public.observation_criteria for insert to authenticated with check (public.is_academic_manager());
create policy observation_criteria_update on public.observation_criteria for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy observation_criteria_delete on public.observation_criteria for delete to authenticated using (public.is_admin());

create policy observations_select on public.teacher_observations for select to authenticated using (public.is_academic_manager() or (teacher_id = public.current_teacher_id() and shared_at is not null));
create policy observations_insert on public.teacher_observations for insert to authenticated with check (public.is_academic_manager());
create policy observations_update on public.teacher_observations for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy observations_delete on public.teacher_observations for delete to authenticated using (public.is_admin());

create policy observation_scores_select on public.observation_scores for select to authenticated using (exists(select 1 from public.teacher_observations o where o.id = observation_id and (public.is_academic_manager() or (o.teacher_id = public.current_teacher_id() and o.shared_at is not null))));
create policy observation_scores_insert on public.observation_scores for insert to authenticated with check (public.is_academic_manager());
create policy observation_scores_update on public.observation_scores for update to authenticated using (public.is_academic_manager()) with check (public.is_academic_manager());
create policy observation_scores_delete on public.observation_scores for delete to authenticated using (public.is_admin());

-- Student ratings: teachers never receive raw rating rows.
create policy ratings_select on public.teacher_ratings for select to authenticated using (public.is_academic_manager() or student_id = public.current_student_id());
create policy ratings_insert on public.teacher_ratings for insert to authenticated with check (
  student_id = public.current_student_id()
  and public.teacher_is_on_session(teacher_id, session_id)
  and exists(select 1 from public.attendance a where a.session_id = teacher_ratings.session_id and a.student_id = public.current_student_id() and a.status in ('Present','Late','Joined partially'))
);
create policy ratings_update on public.teacher_ratings for update to authenticated using (student_id = public.current_student_id()) with check (student_id = public.current_student_id() and public.teacher_is_on_session(teacher_id, session_id));
create policy ratings_delete on public.teacher_ratings for delete to authenticated using (public.is_admin());

-- Finance: only Admin, CSKH, and the student who owns the account.
create policy tuition_select on public.tuition_accounts for select to authenticated using (public.is_customer_service() or student_id = public.current_student_id());
create policy tuition_insert on public.tuition_accounts for insert to authenticated with check (public.is_customer_service());
create policy tuition_update on public.tuition_accounts for update to authenticated using (public.is_customer_service()) with check (public.is_customer_service());
create policy tuition_delete on public.tuition_accounts for delete to authenticated using (public.is_admin());

create policy payments_select on public.payment_transactions for select to authenticated using (public.is_customer_service() or exists(select 1 from public.tuition_accounts ta where ta.id = tuition_account_id and ta.student_id = public.current_student_id()));
create policy payments_insert on public.payment_transactions for insert to authenticated with check (public.is_customer_service());
create policy payments_update on public.payment_transactions for update to authenticated using (public.is_customer_service()) with check (public.is_customer_service());
create policy payments_delete on public.payment_transactions for delete to authenticated using (public.is_admin());

create policy renewals_select on public.renewal_followups for select to authenticated using (public.is_customer_service());
create policy renewals_insert on public.renewal_followups for insert to authenticated with check (public.is_customer_service());
create policy renewals_update on public.renewal_followups for update to authenticated using (public.is_customer_service()) with check (public.is_customer_service());
create policy renewals_delete on public.renewal_followups for delete to authenticated using (public.is_admin());

create policy audit_select on public.audit_logs for select to authenticated using (public.is_admin());

-- Explicit privileges; RLS remains the enforcement layer.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
