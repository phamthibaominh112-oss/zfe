# ZE CenterOS v1.5.5 — Assignment Material Storage RLS Fix

The Assignment row can be created, but attached homework files still fail to upload
because Storage policies from migration 012 still use the legacy class-only
teacher permission model.

Migration 016 aligns `assignment-materials` Storage with the current model:

- Admin / Academic: manage materials.
- Teacher: manage materials when they operate the class.
- If linked to a Session, Teacher must also be assigned to that exact Session.
- Student: can download material when enrolled in the class.

Run:
`supabase/migrations/016_assignment_material_storage_rls.sql`

No application code change is required.
