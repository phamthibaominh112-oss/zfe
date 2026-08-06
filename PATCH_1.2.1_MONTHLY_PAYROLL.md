# ZE CenterOS v1.2.1 — Monthly Payroll & Financial Tracking

## New workflow

1. Admin sets the hourly teaching rate for each teacher from Dashboard or `/payroll`.
2. The system keeps a live monthly estimate from completed sessions.
3. On the last day of the month, Supabase Cron creates a payroll statement for every active teacher.
4. Teachers review the completed hours, rate and expected salary, then approve or report a discrepancy.
5. Admin approves the teacher-confirmed payroll.
6. Approval automatically creates an Approved expense transaction in the monthly cost ledger.
7. Admin can mark the payroll Paid later.

## Monthly revenue and cost import

- `monthly_financial_snapshots` stores monthly management figures.
- `import_monthly_financial_snapshots` is the CSV staging table.
- `commit_monthly_financial_import()` commits staged rows.
- The CSV template is available at `/templates/monthly_financial_summary_template.csv`.

## Deployment

1. Run `supabase/migrations/006_monthly_payroll_and_financial_tracking.sql` in Supabase SQL Editor.
2. Copy the hotfix into the repository, commit and push.
3. No existing data, users or environment variables need to be recreated.

If Supabase Cron cannot be enabled automatically, Admin can still use **Tổng kết lại tháng này** on the Payroll page. Cron can later be enabled from Supabase Integrations → Cron.
