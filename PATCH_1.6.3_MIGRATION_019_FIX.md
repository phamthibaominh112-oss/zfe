# ZE CenterOS v1.6.3 — Migration 019 Fix

Fixes PostgreSQL error:

`column "updated_at" of relation "payment_transactions" does not exist`

The legacy +1 VND cleanup now only updates `amount`.

Re-run migration:
`supabase/migrations/019_strict_checkin_payroll_timesheet.sql`

Because migration 019 is wrapped in BEGIN/COMMIT, the previous failed run was rolled back.
