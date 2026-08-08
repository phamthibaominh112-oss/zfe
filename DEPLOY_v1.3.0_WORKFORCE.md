# Deploy v1.3.0

## 1. Supabase
Run:
`supabase/migrations/009_workforce_checkin_compliance.sql`

## 2. Git/Vercel
Copy the hotfix into the current repository, commit, and push to `main`. Vercel deploys automatically.

## 3. Smoke tests
- Teacher: open `/workforce`, verify today's assigned session is visible.
- Academic: create a work shift, then verify it appears in the weekly schedule.
- CSKH: same as Academic.
- Admin: open `/workforce`, set a staff hourly rate, inspect schedules and payroll controls.
- Teacher KPI: open `/workforce/kpi` and use Print / Save PDF.
