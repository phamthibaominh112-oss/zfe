# ZE CenterOS v2.1.0

## Fixes requested by Operations

### 1. Import Center
New route `/imports` for Admin / Academic / CSKH with role-based import types.

Supported Excel import:
- Students + optional enrollment
- Money list / payments
- Expenses
- Assessment scores
- Canonical 36-session curriculum master

Workflow:
Upload Excel -> Preview -> Validate -> Commit.
If ANY validation error remains, Commit is blocked.
Import jobs and row results are retained for audit.

Curriculum rule:
- ZEB / ZEF / ZEE / ZEM
- ONE master per program
- exactly 36 rows, session_no 1..36
- no class-level syllabus duplication

### 2. Batch attendance visibility
Academic attendance now has its own reliable session query.
For Teacher accounts:
- explicitly filters by `session_teachers.teacher_id`
- shows assigned sessions from the last 7 days through today
- roster is resolved from enrollment effective dates, not only current Active status
- batch save re-validates teacher assignment server-side

This removes cases where a teacher has a valid assigned session but the generic Academic list did not surface it.

### 3. Admin approve many override requests
Pending teacher check-in override requests now have:
- checkbox selection
- Select all
- one shared Admin note
- Approve selected in one action

The existing direct Admin batch override for missing IN/OUT remains available separately.

### 4. Curriculum UI overlay
The Create ZEB/ZEF/ZEE/ZEM Master form is now inline inside its card instead of opening an oversized absolute-position popover.

## Database migration
Run `supabase/migrations/025_bulk_import_center.sql` after migration 024.

## New dependency
`exceljs@4.4.0` for server-side .xlsx/.xlsm parsing.
