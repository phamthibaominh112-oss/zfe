-- ZE CenterOS v1.8.0
-- Weekly teacher availability: atomic multi-day save.

begin;

create index if not exists idx_teacher_availability_week_lookup
  on public.teacher_availability(teacher_id,effective_from,effective_to,weekday);

create or replace function public.save_teacher_week_availability(
  p_teacher_id uuid,
  p_week_start date,
  p_slots jsonb,
  p_mode text default null,
  p_campus text default null,
  p_note text default null
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_week_end date:=p_week_start+6;
  v_role public.app_role:=public.current_role();
  v_count integer:=0;
  slot jsonb;
  v_day integer;
  v_start time;
  v_end time;
begin
  if v_role='teacher' and p_teacher_id<>public.current_teacher_id() then
    raise exception 'Teacher can only save own availability';
  end if;
  if v_role not in ('teacher','admin','academic_manager') then
    raise exception 'Permission denied';
  end if;
  if jsonb_typeof(coalesce(p_slots,'[]'::jsonb))<>'array' then
    raise exception 'Invalid availability payload';
  end if;

  delete from public.teacher_availability
  where teacher_id=p_teacher_id
    and effective_from=p_week_start
    and effective_to=v_week_end
    and is_recurring=false;

  for slot in select * from jsonb_array_elements(coalesce(p_slots,'[]'::jsonb))
  loop
    v_day=(slot->>'weekday')::integer;
    v_start=(slot->>'start_time')::time;
    v_end=(slot->>'end_time')::time;
    if v_day not between 1 and 7 then raise exception 'Invalid weekday'; end if;
    if v_end<=v_start then raise exception 'End time must be after start time on weekday %',v_day; end if;

    insert into public.teacher_availability(
      teacher_id,weekday,start_time,end_time,mode,campus,effective_from,effective_to,is_recurring,note,created_by
    ) values (
      p_teacher_id,v_day,v_start,v_end,nullif(p_mode,'')::public.delivery_mode,
      nullif(trim(coalesce(p_campus,'')),''),p_week_start,v_week_end,false,
      nullif(trim(coalesce(p_note,'')),''),auth.uid()
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.save_teacher_week_availability(uuid,date,jsonb,text,text,text) to authenticated;

commit;
