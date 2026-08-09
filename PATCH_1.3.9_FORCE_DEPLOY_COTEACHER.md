# ZE CenterOS v1.3.9 — FORCE DEPLOY Co-teacher

This release exists because the deployed app was still showing old source:
- no dedicated Co-teacher/TA control;
- raw `uq_sessions_active_class_session_no` database error.

The v1.3.8 source already contained the correct feature, so v1.3.9 adds:
- a visible build marker: `v1.3.9 · CO-TEACHER ENABLED`;
- clearer Co-teacher wording;
- a full-source force deployment script;
- pre-push grep checks.

Correct model:
- ONE row in `sessions` per lesson.
- Main teacher and Co-teacher/TA are TWO rows in `session_teachers`.
- Adding a TA never creates another `sessions` row.
