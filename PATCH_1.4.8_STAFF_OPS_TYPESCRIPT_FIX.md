# ZE CenterOS v1.4.8 — Staff Ops TypeScript Build Fix

Fixes the Vercel TypeScript error in `adminCreateAccountabilityLog`:

`Parameter 'u' implicitly has an 'any' type.`

The Supabase Auth user callback now has an explicit shape:
`{ id: string; email?: string | null }`.

No database migration is required. Migration 013 from v1.4.7 remains unchanged.
