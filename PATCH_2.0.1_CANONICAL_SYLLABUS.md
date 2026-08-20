# ZE CenterOS v2.0.1 — Canonical Syllabus Architecture

## Corrected concept
Each IELTS program has exactly ONE canonical 36-session syllabus:
- ZEB — IELTS Beginner
- ZEF — IELTS Foundation
- ZEE — IELTS Entry
- ZEM — IELTS Master

Classes inherit automatically by class-code prefix:
- ZEF26001 -> ZEF Master
- ZEF26002 -> ZEF Master
- ZEF26003 -> ZEF Master

There is NO duplicate-to-class workflow anymore.

## Class-specific exception
If one class must teach a different lesson for one session, create a
`class_syllabus_overrides` record for that class + session number.

Only that session is overridden. All other sessions still read the master.

## Legacy data
`class_syllabus_items` is preserved for audit/history but is no longer the
primary source shown in new Curriculum, Schedule, Academic, or Student Learning UI.

## 36-session rule
Canonical syllabus can be activated only when it contains exactly:
Session 1, 2, ... 36.

## Bulk import rule
Curriculum Excel must import program master rows, not class copies.
One program_code can have exactly 36 rows (session_no 1–36).
