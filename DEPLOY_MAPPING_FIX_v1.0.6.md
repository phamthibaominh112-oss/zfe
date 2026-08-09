# ZE CenterOS v1.0.6 — Teacher/Student Mapping Fix

## 1. Repair database relationships
Run `supabase/repair_teacher_student_mapping_v1.0.6.sql` in Supabase SQL Editor.

The script is idempotent and does not delete data. It:
- re-commits staging relationship tables when available;
- restores `class_teachers` from `session_teachers`;
- assigns the unique class teacher to sessions that have no teacher;
- restores missing Auth `user_id` links from exact email matches;
- outputs a full Student → Class → Teacher mapping and unresolved issues.

## 2. Deploy UI patch
Commit the v1.0.6 source to GitHub. Students will see assigned teachers; teachers will see enrolled students in their assigned classes.
