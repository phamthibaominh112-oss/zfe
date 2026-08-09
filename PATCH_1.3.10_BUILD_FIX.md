# ZE CenterOS v1.3.10 — Vercel Build Fix

Vercel v1.3.9 failed TypeScript type-check because `sessionDisplayLabel`
was used without being imported.

Fixed:
- `app/(protected)/academic/page.tsx`
- `app/(protected)/dashboard/page.tsx`

Both now import:
`sessionDisplayLabel` from `@/lib/format`.

All v1.3.9 Co-teacher/TA functionality is retained:
- one session only;
- Main teacher + Co-teacher/TA stored in `session_teachers`;
- dedicated same-session team management;
- friendly duplicate guard.

Visible live marker after successful deployment:
`v1.3.10 · CO-TEACHER ENABLED · BUILD FIX`
