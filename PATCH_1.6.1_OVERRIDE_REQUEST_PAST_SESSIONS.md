# ZE CenterOS v1.6.1 — Override Request + Past Sessions

## Teacher
Check-in & KPI now has `Buổi đã qua` for the selected month.

For past sessions:
- See previous Check-in / Check-out.
- See payroll eligibility.
- If a clock record is missing, send an Override Request.
- Enter actual Check-in / Check-out and technical reason.
- One Pending request per Teacher + Session.
- Teacher can cancel a Pending request.
- Approved / Rejected status and Admin note are visible.

## Admin
Workforce has a new Override Approval inbox.

Admin can:
- review teacher, class, session and requested times;
- Approve and apply the clock correction atomically;
- Reject with a required note;
- still use the direct Admin Override panel for exceptional cases.

## Calendar UI
Teacher/Student weekly schedules now use a compact minimum height so sparse weeks
do not render a huge empty white calendar.

## Database
Run:
`supabase/migrations/018_teacher_checkin_override_request.sql`

Migration 017 must already exist because approval calls
`admin_override_teacher_checkin`.
