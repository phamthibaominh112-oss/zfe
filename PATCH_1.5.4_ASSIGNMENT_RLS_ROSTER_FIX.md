# ZE CenterOS v1.5.4 — Assignment RLS + Attendance Roster Fix

## Symptoms fixed
1. Teacher creates an Assignment and gets:
   `new row violates row-level security policy for table "assignments"`

2. A valid teaching Session appears in the Teacher/Academic interface but Batch
   Attendance shows `0 HV`.

## Root cause
Legacy RLS used only `class_teachers`.
Current ZE CenterOS also assigns teachers directly to individual sessions through
`session_teachers`.

The UI was using the current model, while several DB policies still used the
legacy model.

## Database fix
Migration 015 introduces:
`teacher_operates_class(class_id)`

A Teacher is operationally connected when:
- assigned at class level; OR
- assigned directly to a session in that class.

Updated policies:
- enrollment roster SELECT
- student visibility for roster
- assignment INSERT / UPDATE
- assessment SELECT / INSERT / UPDATE

For an Assignment linked to a specific Session, the Teacher must still be
assigned to that exact Session.

## UI
If a Session genuinely has no active enrollment roster, Batch Attendance now
shows a clear warning instead of an ambiguous `0/0`.

## Required
Run:
`supabase/migrations/015_teacher_session_roster_assignment_rls.sql`
before testing the fix.
