# ZE CenterOS v1.3.8 — Dedicated Same-Session GV + TA Assignment

Fixes the operational mistake where users attempted to create a second session
to assign a TA and hit `uq_sessions_active_class_session_no`.

## New workflow
Each existing session card now contains:
`👥 Phân công GV/TA`

The form updates only `session_teachers`:
- Main teacher
- Assistant (TA)

It does NOT create or duplicate rows in `sessions`.

## Duplicate guard
If a user tries to create another active session using an existing
`class_id + session_no`, the UI now explains:
- the lesson already exists;
- if the intent is adding TA, use the dedicated GV/TA form on that lesson.

No new SQL is required for v1.3.8.
Migration 010 should already be applied.
