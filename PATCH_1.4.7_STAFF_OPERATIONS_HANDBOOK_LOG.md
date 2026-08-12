# ZE CenterOS v1.4.7 — Restricted Staff Operations Handbook + Daily Work Log

## Access control
This module is NOT granted to every Academic/CSKH account.

Allowed back-office users:
- khangaca@gmail.com — Khang · Academic & Teacher Quality
- thinhaca@gmail.com — Thịnh · Scheduling & Student Operations
- studentcare@gmail.com — Mai · Customer Success & Admissions Operations

Admin:
- can access the module;
- can read all logs;
- can review/flag logs;
- can manage Accountability Log.

Teachers and every other account:
- no sidebar menu;
- direct URL `/staff-ops` is blocked server-side;
- database RLS also blocks access.

## Handbook
The uploaded `Zest for English · Staff Operations Handbook v2.0` is embedded inside ZE CenterOS.
The original HTML is also retained under `content/handbooks/source/` for archival reference.

## Database Daily Work Log
The original handbook's browser-local Daily Log is replaced by a database-backed OS form with:
- Work date
- Actual check-in
- Actual check-out
- Outcome 1
- Outcome 2
- Outcome 3
- Completed today
- Open work / risk / handover
- Delay / SLA breach
- 3 priorities for tomorrow
- Draft / Submitted
- Submitted timestamp
- Manager Review status/note

Actual check-in/out is read from CenterOS workforce logs for the selected date.

## Admin control
Admin has:
- today's submission completeness (Khang / Thịnh / Mai)
- all recent Daily Work Logs
- Manager Review: Pending / Reviewed / Needs follow-up
- manager note
- Accountability Log
- Level 1 / Level 2 / Level 3
- corrective action / deadline / monitoring / closed

## SQL
Run:
`supabase/migrations/013_staff_operations_daily_log.sql`

Migration creates:
- `staff_daily_logs`
- `staff_accountability_logs`
- exact-email RLS policies
- audit triggers

## Deploy order
1. Run migration 013 in Supabase SQL Editor.
2. Deploy code.
3. Test the four access cases:
   - Khang sees Staff Operations.
   - Thịnh sees Staff Operations.
   - Mai/studentcare sees Staff Operations.
   - Teacher cannot see/open Staff Operations.
4. Submit one Daily Log from each account.
5. Admin confirms 3/3 and performs Manager Review.
