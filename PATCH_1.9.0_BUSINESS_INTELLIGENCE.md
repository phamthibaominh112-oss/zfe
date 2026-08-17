# ZE CenterOS v1.9.0 — Business Intelligence

## Renamed
Finance Intelligence -> Business Intelligence.

Legacy `/finance-intelligence` redirects to:
`/business-intelligence?tab=finance`

## Business KPI
Default monthly targets:
- Revenue (Allocated Revenue): 150,000,000 VND
- New learners: 10
- Profit: 70,000,000 VND

Admin can edit targets.

## Executive / Finance / Learners / KPI
Business Intelligence contains:
1. Executive
2. Finance
3. Learners & Retention
4. KPI & Trend
5. Access (Admin only)

## Learner retention / risk
Signals include:
- Paused / Stopped
- attendance below 60% / 75%
- outstanding tuition
- renewal due within 14 days
- no future session in next 14 days

Student status changes are now logged to `student_status_history`.

## Founder / Co-founder access
Admin always has access.
Admin can grant a non-Admin user Viewer or Owner/Co-founder access without granting full Admin rights.

## Data connections
- payment_transactions -> Cash In
- tuition/enrollment -> Revenue Allocation
- expense_transactions -> Expenses / Profit
- approved teacher payroll -> expense_transactions -> Business Intelligence
- student/enrollment/attendance/tuition -> Retention & Risk

All finance-changing actions now revalidate `/business-intelligence`.

## Sidebar
Admin sidebar is collapsed into four groups:
- Vận hành
- Học viên & Học thuật
- Business & Tài chính
- Hệ thống

Required migration:
`supabase/migrations/022_business_intelligence_kpi_retention.sql`
