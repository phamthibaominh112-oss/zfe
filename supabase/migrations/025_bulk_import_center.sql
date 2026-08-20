-- ZE CenterOS v2.1.0
-- Bulk Import Center staging + audit.

begin;

create table if not exists public.bulk_import_jobs (
  id uuid primary key default gen_random_uuid(),
  import_type text not null check(import_type in ('students','payments','expenses','scores','curriculum')),
  file_name text not null,
  sheet_name text,
  status text not null default 'Preview' check(status in ('Preview','Ready','Importing','Completed','Partial','Failed','Cancelled')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  error_rows integer not null default 0,
  imported_rows integer not null default 0,
  skipped_rows integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.bulk_import_rows (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.bulk_import_jobs(id) on delete cascade,
  row_no integer not null,
  payload jsonb not null,
  validation_errors text[] not null default '{}',
  status text not null default 'Valid' check(status in ('Valid','Error','Imported','Skipped')),
  result_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id,row_no)
);

create index if not exists idx_bulk_import_jobs_created on public.bulk_import_jobs(created_at desc);
create index if not exists idx_bulk_import_rows_job_status on public.bulk_import_rows(job_id,status,row_no);

alter table public.bulk_import_jobs enable row level security;
alter table public.bulk_import_rows enable row level security;

-- Direct client access is intentionally read-only. Writes run through audited server actions.
drop policy if exists bulk_import_jobs_select on public.bulk_import_jobs;
create policy bulk_import_jobs_select on public.bulk_import_jobs for select to authenticated
using (
  public.current_role()='admin'
  or (public.current_role() in ('academic_manager','customer_service') and created_by=auth.uid())
);

drop policy if exists bulk_import_rows_select on public.bulk_import_rows;
create policy bulk_import_rows_select on public.bulk_import_rows for select to authenticated
using (
  exists(select 1 from public.bulk_import_jobs j where j.id=job_id and (
    public.current_role()='admin'
    or (public.current_role() in ('academic_manager','customer_service') and j.created_by=auth.uid())
  ))
);

commit;
