# Deploy ZE CenterOS v1.2.0

## 1. Run the database migration first

In Supabase → SQL Editor, run:

`supabase/migrations/005_finance_accounting_notifications.sql`

This creates expense accounting, receipts, notifications, payroll reporting and the necessary RLS policies.

## 2. Upload the hotfix to the existing Git repository

Copy all hotfix files over the current repository, commit and push to `main`. Vercel will deploy automatically.

## 3. Verify by role

### Admin

- `/finance`: income, tuition, receipts and renewal alerts.
- `/finance/expenses`: fixed/variable expenses and teacher payroll.
- `/finance/reports`: six-month income and expense report.

### CSKH

- Record payments and print receipts.
- Create renewal follow-ups.
- Send student notifications.
- Cannot access expense or payroll pages.

### Student

- View own tuition, payment history and receipts.
- Receive payment/renewal notifications through the notification bell.

### Academic/Teacher

- No tuition, payment, expense or payroll access.
