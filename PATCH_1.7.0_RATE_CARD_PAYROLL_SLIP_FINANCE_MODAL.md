# ZE CenterOS v1.7.0 — Rate Card + Payroll Slip + Finance Modal Fix

## Finance UI
The edit forms inside tuition/payment tables were clipped by table overflow.
They now open as fixed modal overlays and remain fully clickable/selectable.

## Teacher Rate Card
Teaching is no longer one flat hourly rate.

Automatic session classification:
- Kèm / Tutoring = 1–3 active students
- Nhóm / Group = more than 3 active students
- TA = separate rate

For legacy sessions with no roster:
- ZK => Kèm
- all other class categories => Nhóm

HR rates seeded effective 01/08/2026:
- Dũng: Kèm 315,000 | Nhóm 365,000
- Nhung: Kèm 375,000 | Nhóm 425,000
- Minh: Kèm 50,000 | Nhóm 50,000
- Nam: Kèm 50,000 | Nhóm 50,000
- Thịnh: Kèm 100,000 | Nhóm 100,000

Existing TA rates are preserved.

## Payroll
Monthly live payroll now separates:
- Kèm hours / rate / amount
- Nhóm hours / rate / amount
- TA hours / rate / amount

Only sessions with valid Check-in + Check-out are payable.

## Payslip
New printable route:
`/payroll/slip`

Teacher and Admin can export a ZEST-branded PDF showing:
- teacher + payroll month
- Kèm / Nhóm / TA breakdown
- session-level class size, applied rate, payable hours, amount
- total gross salary
- approval status

## Required migration
Run:
`supabase/migrations/020_teacher_rate_card_by_class_size.sql`
