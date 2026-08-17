# ZE CenterOS v1.8.0

## Finance Intelligence
The uploaded ZFE Finance Interactive Dashboard v4 is mounted inside CenterOS.
Its visual/UI code is preserved, while the embedded `D` object is rebuilt live.

Mapping:
- Tuition Account + Enrollment Start/End -> Allocated Revenue
- Service elapsed to today -> Recognized Revenue
- Payment Transactions -> Cash In and student ledger
- Expense Transactions -> Cash Out and cost baseline
- Student balances / renewal dates / missing service dates -> Alerts
- Founder split -> 80/20 from 2026-08

Admin route:
`/finance-intelligence`

Admin dashboard now shows live:
Allocated / Recognized / Cash In / Deferred / Future Allocated / Unallocated.

## Weekly Teacher Availability
Teacher can select several days at once and save one weekly availability sheet.
The viewed week stays fixed.

Migration 021 provides one atomic RPC:
`save_teacher_week_availability`

## Batch Override
Teacher:
- multi-select or Select All missed past sessions
- one reason
- scheduled start/end are proposed clock values
- Pending requests are skipped

Admin:
- sees all past missing clocks in selected month
- multi-select / Select All
- one common reason
- scheduled times are written via existing Admin override RPC

Run:
`supabase/migrations/021_weekly_availability_batch_override.sql`
