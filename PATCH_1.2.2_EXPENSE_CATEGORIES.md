# ZE CenterOS v1.2.2 — Expense categories & payroll-rate guard

## Updated

- Admin can set teacher hourly rates directly from **Dashboard**, **Chi phí vận hành**, and **Lương giáo viên**.
- Zero hourly rates are rejected with a clear message.
- Payroll cannot be approved or posted to expenses when completed hours, hourly rate, or gross salary is zero.
- Expense entry now separates:
  - **Nhóm chi phí**
  - **Loại chi phí** (Cố định / Biến đổi / Lương / Hoa hồng / Khác)
- Active category list is aligned with the uploaded ZEST July 2026 operating-cost workbook.

## Required migration

Run `supabase/migrations/007_expense_categories_and_payroll_guard.sql` after migration 006.
