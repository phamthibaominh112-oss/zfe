# ZE CenterOS v1.4.9 — Optional Session Observer

## New session role
A teaching session now has three operational participants:

1. Main Teacher
2. Co-teacher / TA
3. Observer (optional)

Observer is stored separately in `session_observers`, not `session_teachers`.

Why:
- Observer may be Academic/Admin rather than a teacher.
- Observer must not affect Teaching payroll.
- Observer must not affect TA payroll.
- Observer must not be counted in teacher workload / KPI.
- Observer is assigned to one specific session only.

## Academic/Admin workflow
On every session card:
`👁 Phân Observer`

Academic/Admin can:
- choose an active Academic/Admin observer;
- add an observation note;
- change observer;
- remove observer by selecting blank and saving.

## Visibility
- Admin / Academic can manage Observer.
- Assigned teacher can read the Observer assignment on the session card.
- Observer can read their own assignment through RLS.
- Students do not receive Observer assignment data.

## Database
Run:
`supabase/migrations/014_session_observer_assignment.sql`

No changes are made to payroll views.
