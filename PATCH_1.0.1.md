# Patch 1.0.1

## Fixed

- Fixed the Vercel/Next.js TypeScript build failure in `app/(protected)/classes/[id]/page.tsx`.
- Supabase embedded relations such as `programs(name)` and `levels(name)` may be inferred as arrays even when PostgREST returns a single related row.
- Added `getJoinedName()` to safely support both object and array relation shapes without weakening the rest of the page typing.

## Verification

- All 37 TypeScript/TSX source files passed syntax transpilation.
- The relation helper passed a strict TypeScript semantic check against the exact array type shown in the Vercel error.
- Production package verification passed, including RBAC navigation, RLS markers and finance-route isolation.
