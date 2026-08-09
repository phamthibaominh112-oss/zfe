# ZE CenterOS v1.3.7 — Hard Fix: Main Teacher + TA

This patch deliberately re-ships the full set of files required for the
Main Teacher + TA workflow instead of assuming earlier patches are present.

Included:
- `app/actions.ts`
- `app/(protected)/schedule/page.tsx`
- `app/(protected)/classes/[id]/page.tsx`
- `app/globals.css`
- `lib/format.ts`

Expected behavior:
- Create/Edit session shows both `Giáo viên chính (GV)` and `Trợ giảng (TA)`.
- Saving writes both `Main teacher` and `Assistant` rows to `session_teachers`.
- Schedule cards show both GV and TA.
- Class detail supports Main teacher + TA at class level.
- New sessions may inherit the class teaching team.
- Main teacher and TA cannot be the same person.

Visible verification marker:
`Đội ngũ buổi học — Mỗi session hỗ trợ đồng thời 1 GV chính + 1 Trợ giảng (TA).`

No new SQL is required for v1.3.7.
Migration 010 from v1.3.4 should already be applied.
