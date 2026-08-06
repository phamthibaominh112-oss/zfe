# Deploy v1.2.1

## A. Database
Run:

`supabase/migrations/006_monthly_payroll_and_financial_tracking.sql`

## B. Application
Copy the hotfix into the current repository, then commit and push to `main`.

## C. Check
- Admin Dashboard shows hourly-rate controls.
- Teacher Dashboard shows monthly payroll summary.
- `/payroll` opens for Admin and Teacher only.
- Teacher approval changes the statement status.
- Admin approval creates an expense transaction.
- Finance Reports show an empty import-ready monthly balance panel.
