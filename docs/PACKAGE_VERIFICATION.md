# Package verification

Verification date: 2026-08-02

## Passed checks

- TypeScript/TSX syntax transpilation across the application source.
- Semantic TypeScript check against the project interfaces using local declaration stubs.
- Custom production verifier: `npm run verify`.
- No role switcher, localStorage database, seeded student/class/payment records, or demo login accounts.
- Finance navigation and route guard exclude Teacher and Academic Manager.
- Supabase Row Level Security policies restrict finance to Admin, CSKH, and the owning Student.
- Student and Teacher identity helper functions are role-gated to prevent stale linked profiles from retaining old access after a role change.
- All 30 application tables are included in the RLS enablement migration and have explicit policies.
- Delete policies are Admin-only; normal operations use archive/soft-delete.
- Service-role key is server-only and is not exposed through a `NEXT_PUBLIC_` variable.
- Assignment storage bucket is private and access is controlled by object-level policies.

## Build environment limitation

The current artifact environment could not complete `npm install` against the public npm registry because outbound registry DNS/package access was unavailable. Therefore a real `next build` was not executed here.

The repository includes:

- exact dependency pins,
- `npm run typecheck`,
- `npm run verify`,
- `npm run build`, and
- a GitHub Actions workflow that performs install, verification, typecheck, and production build in a normal networked CI environment.

Do not put real data into the platform until the GitHub Actions workflow and Vercel production build both pass.
