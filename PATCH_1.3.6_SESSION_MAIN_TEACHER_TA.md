# ZE CenterOS v1.3.6 — Main Teacher + TA in the Same Session

- Every session can store both a Main teacher and an Assistant (TA).
- Create/Edit Session shows a prominent `Đội ngũ buổi học` block.
- Schedule cards show separate lines for GV chính and TA.
- Both assignments are persisted in `session_teachers`.
- TA and Main teacher cannot be the same person.
- New sessions can inherit the class-level teaching team.

No new SQL is required for v1.3.6.
Migration 010 from v1.3.4 should already be applied.
