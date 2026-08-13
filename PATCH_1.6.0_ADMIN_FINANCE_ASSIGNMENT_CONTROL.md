# ZE CenterOS v1.6.0 — Admin Control + Assignment / Finance / Override Fix

## Admin
Admin receives an explicit permissive RLS policy on core operational tables so a
role-specific policy cannot accidentally block Admin again.

## Assignment
- Teacher can edit assignments created by that Teacher.
- Teacher can remove/archive assignments created by that Teacher.
- Academic/Admin can edit/archive all assignments.
- Admin still has DB-level DELETE permission.
- Assignment edit supports title, instructions, deadline, score, publish state,
  and replacing the attached homework material.

## Admin Check-in / Check-out Override
Override now uses authenticated SECURITY DEFINER RPCs:
- `admin_override_teacher_checkin`
- `admin_override_staff_checkin`

No service-role browser/server write path is required.
Vietnam local datetime inputs are converted explicitly to UTC ISO before RPC.

## Receipt / Payment
Fixes HTML validation that previously made `1,001`, `2,001`, etc. valid amounts:
- minimum is now 1,000
- step is 1,000
- valid amounts are 1,000 / 2,000 / 300,000 / etc.

Admin and CSKH can:
- edit transaction amount/time/method/reference/note
- edit printable receipt payer/package/method/reference/note
- delete an incorrect payment + receipt atomically with a mandatory reason

Deleting a payment:
1. deletes the generated receipt
2. deletes its payment notification
3. deletes `payment_transactions`
4. existing DB trigger recalculates tuition paid/balance
5. revenue reports automatically decrease because revenue is sourced from
   `payment_transactions`

## Revenue
Finance now shows `Doanh thu tháng này`.
Source of truth: sum of `payment_transactions.amount` for the month.

Run migration:
`supabase/migrations/017_admin_control_finance_assignment_override.sql`
