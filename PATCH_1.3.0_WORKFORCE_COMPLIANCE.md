# ZE CenterOS v1.3.0 — Workforce & Compliance

## New capabilities

### Teacher
- Check-in before a scheduled teaching session and Check-out near session end.
- From the migration effective date onward, only completed sessions with valid Check-in + Check-out count toward payroll hours.
- Monthly compliance KPI calculated automatically from portal timestamps:
  - Punctuality: Check-in no later than scheduled start.
  - Assignment compliance: a published assignment linked to the session within 24 hours after session end.
  - Grading compliance: the assigned teacher grades each submitted homework within 7 days of submission.
- KPI visible on dashboard and printable to PDF from `/workforce/kpi`.

### Academic / Customer Service
- Register work schedules.
- Check-in / Check-out work shifts.
- Monthly worked hours and estimated salary based on actual clocked time, capped by the scheduled shift.
- Confirm or dispute the monthly payroll statement before Admin approval.

### Admin
- View Academic/CSKH schedules and clock records.
- Set hourly rates for Academic/CSKH.
- Generate monthly staff payroll statements.
- Approve payroll; approved payroll is posted automatically to operating expenses under `PAYROLL_STAFF`.
- Review teacher KPI and regenerate monthly KPI snapshots.

## Month-end automation
The existing month-end cron job continues to call `run_month_end_payroll_job()`. Migration 009 replaces this function so the job now closes:
1. Teacher payroll
2. Academic/CSKH payroll
3. Teacher KPI snapshots

## Deployment
1. Run `supabase/migrations/009_workforce_checkin_compliance.sql` in Supabase SQL Editor.
2. Deploy the v1.3.0 hotfix to the current Git repository.
3. No existing users, imported classes, sessions, finance data, or environment variables need to be recreated.

## Effective date
`workforce_settings.teacher_checkin_effective_from` defaults to the date migration 009 is run. Historical completed teaching sessions before that date remain payroll-eligible without a check-in record.
