# ZE CenterOS v1.4.6 — TypeScript Build Fix

Vercel v1.4.5 failed during TypeScript checking at `app/actions.ts`
inside `duplicatePreviousWeekSchedule`.

Error:
`Argument of type 'unknown' is not assignable to parameter of type 'string'.`

Fix:
- Explicitly type duplicated schedule class IDs as `string[]`.
- Normalize each `class_id` with `String(...)`.
- Keep `nextNo` as `Map<string, number>`.

All v1.4.5 Assignment File Exchange features are retained.

Database:
- No new SQL migration for v1.4.6.
- Migration 012 from v1.4.5 is still required for Assignment File Exchange.
