# ZE CenterOS v2.3.1 — SLA SQL View Compatibility Fix

Fixes PostgreSQL error 42P16 when migration 027 replaces `teacher_grading_compliance`.

Reason: PostgreSQL CREATE OR REPLACE VIEW cannot rename/reorder existing columns.
The old view ended with:
- grading_deadline_at
- grading_due
- graded_on_time

Migration 027 inserted assignment_due_at before those columns, which PostgreSQL interpreted as a rename.

Fix: preserve every existing column in its original order and append `assignment_due_at` as the final column.

Because migration 027 is wrapped in BEGIN/COMMIT, a failed run is rolled back. Re-run the corrected 027 file from the beginning.
No separate 028 migration is required.
