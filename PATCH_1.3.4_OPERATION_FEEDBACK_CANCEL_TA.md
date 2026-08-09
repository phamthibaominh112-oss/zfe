# ZE CenterOS v1.3.4 — Operation Feedback

## Cancelled session numbering
- Cancelled sessions remain in history/audit.
- UI displays `Buổi hủy · không tính số`.
- A replacement active session can reuse the same lesson number.
- Example: Thursday `Buổi 1` cancelled → Friday may also be active `Buổi 1`.
- No workaround such as `1A` is required.

## One class = 1 Main teacher + optional 1 TA
- Class detail has a dedicated Teaching Team form.
- Academic/Admin set Main teacher and TA separately.
- Session create/edit also supports Main teacher + TA.
- If session staffing is blank, createSession inherits the class-level team.
- Schedule cards show `GV: ... · TA: ...`.
- Main teacher and TA cannot be the same person.

Run migration:
`supabase/migrations/010_cancelled_session_numbering_and_class_ta.sql`
