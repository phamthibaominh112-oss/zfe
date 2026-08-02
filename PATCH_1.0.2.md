# Patch 1.0.2

## Fixed

- Fixed `ParserError` on `students/[id]/page.tsx` caused by PostgREST compile-time parsing of a dynamic `.select(select)` expression.
- Replaced both student list/detail dynamic SELECT expressions with explicit role-based query branches.
- Applied a single client-boundary typing strategy across browser, server and admin Supabase clients so nested relations no longer alternate between object/array/`ParserError` types during Next.js builds.
- Runtime data isolation remains enforced by PostgreSQL RLS; the service-role client remains server-only.
- Added a source syntax check to `prebuild`.
- Updated Next.js to 16.2.12.
