# ZE CenterOS v2.1.2 — Curriculum Import Validation Fix

Fixes curriculum Excel preview where one program-summary/metadata row was counted as a 37th lesson.

Changes:
- Ignore non-session curriculum metadata rows that have program/syllabus metadata but no valid session_no 1–36 and no lesson title.
- Count canonical completeness from valid session rows only.
- Do not repeat the same 36-session completeness error on every row.
- Duplicate session errors are shown only on duplicated rows.
- Missing session error is summarized once while still blocking Commit.

No SQL migration required.
