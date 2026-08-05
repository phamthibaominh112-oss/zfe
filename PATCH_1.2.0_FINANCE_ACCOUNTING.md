# ZE CenterOS v1.2.0 — Finance & Accounting

## New modules

- Payment recording with automatically generated printable receipts.
- Student in-app notifications for payment confirmation and renewal reminders.
- CSKH manual finance notices and bulk renewal reminders.
- Admin-only expense ledger for fixed costs, variable costs, payroll, commissions and other expenses.
- Teacher payroll estimation from completed session hours × payroll factor × hourly rate.
- Six-month cash-flow report and expense-category breakdown.
- Tuition usage tracking recalculated from completed sessions.
- Notification bell and unread notification center for every user.

## Required database migration

Run `supabase/migrations/005_finance_accounting_notifications.sql` in Supabase SQL Editor before deploying the code update.

## Permission summary

- Admin: all income, expenses, payroll and reports.
- CSKH: tuition, payments, printable receipts, renewal pipeline and student finance notifications.
- Student: own tuition, own receipts and own notifications.
- Academic Manager and Teacher: no access to tuition or expense data.
