-- ZE CenterOS v2.0.1
-- Canonical syllabus architecture:
-- ONE master syllabus per program code (ZEB/ZEF/ZEE/ZEM), 36 sessions.
-- Classes inherit automatically from class-code prefix.
-- Class-specific changes are stored ONLY as per-session overrides.

begin;

alter table public.syllabus_templates
  add column if not exists program_code text;

alter table public.syllabus_templates
  drop constraint if exists syllabus_templates_program_code_check;

alter table public.syllabus_templates
  add constraint syllabus_templates_program_code_check
  check (program_code is null or program_code in ('ZEB','ZEF','ZEE','ZEM'));

-- Best-effort migration for any newly created syllabus masters that already
-- used canonical codes/names. Legacy templates remain untouched and archived
-- from the new canonical UI, not deleted.
update public.syllabus_templates
set program_code = case
  when upper(code) like '%ZEB%' or upper(name) like '%BEGINNER%' then 'ZEB'
  when upper(code) like '%ZEF%' or upper(name) like '%FOUNDATION%' then 'ZEF'
  when upper(code) like '%ZEE%' or upper(name) like '%ENTRY%' then 'ZEE'
  when upper(code) like '%ZEM%' or upper(name) like '%MASTER%' then 'ZEM'
  else program_code
end
where program_code is null;

-- If historical data accidentally produced more than one active candidate
-- for the same canonical program, keep the newest one canonical and leave
-- older rows as legacy (program_code null) so no data is destroyed.
with ranked as (
  select id,program_code,
         row_number() over(partition by program_code order by updated_at desc nulls last, created_at desc, id) rn
  from public.syllabus_templates
  where program_code is not null and archived_at is null
)
update public.syllabus_templates s
set program_code=null
from ranked r
where s.id=r.id and r.rn>1;

create unique index if not exists uq_syllabus_one_master_per_program
on public.syllabus_templates(program_code)
where program_code is not null and archived_at is null;

create table if not exists public.class_syllabus_overrides (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  session_no integer not null check(session_no between 1 and 36),
  title text,
  learning_objectives text,
  content text,
  homework text,
  slide_url text,
  material_file_path text,
  material_file_name text,
  material_file_mime text,
  material_file_size bigint,
  override_reason text not null,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(class_id,session_no)
);

create index if not exists idx_class_syllabus_overrides_class_session
on public.class_syllabus_overrides(class_id,session_no)
where archived_at is null;

alter table public.class_syllabus_overrides enable row level security;

drop policy if exists class_syllabus_overrides_select on public.class_syllabus_overrides;
create policy class_syllabus_overrides_select
on public.class_syllabus_overrides for select to authenticated
using (
  public.current_role() in ('admin','academic_manager','customer_service')
  or public.teacher_operates_class(class_id)
  or public.student_in_class(class_id)
);

drop policy if exists class_syllabus_overrides_write on public.class_syllabus_overrides;
create policy class_syllabus_overrides_write
on public.class_syllabus_overrides for all to authenticated
using (public.current_role() in ('admin','academic_manager'))
with check (public.current_role() in ('admin','academic_manager'));

-- Canonical masters must always have exactly 36 items before Active.
create or replace function public.enforce_canonical_syllabus_36()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count integer;
  v_missing integer;
begin
  if new.program_code is null or new.status <> 'Active' then
    return new;
  end if;

  select count(*), count(*) filter(where x.session_no is null)
    into v_count, v_missing
  from generate_series(1,36) g(session_no)
  left join public.syllabus_template_items x
    on x.template_id=new.id and x.session_no=g.session_no;

  select count(*) into v_count
  from public.syllabus_template_items
  where template_id=new.id;

  if v_count <> 36 then
    raise exception 'Canonical syllabus % must contain exactly 36 sessions before activation. Current: %', new.program_code, v_count;
  end if;

  if exists (
    select 1
    from generate_series(1,36) g(session_no)
    left join public.syllabus_template_items x
      on x.template_id=new.id and x.session_no=g.session_no
    where x.id is null
  ) then
    raise exception 'Canonical syllabus % must contain every session number 1 to 36.', new.program_code;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_canonical_syllabus_36 on public.syllabus_templates;
create trigger trg_enforce_canonical_syllabus_36
before insert or update of status,program_code on public.syllabus_templates
for each row execute function public.enforce_canonical_syllabus_36();

commit;
