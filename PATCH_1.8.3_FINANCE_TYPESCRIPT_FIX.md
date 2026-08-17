# ZE CenterOS v1.8.3 — Finance TypeScript Build Fix

Fixes production build error in `lib/finance-dashboard-data.ts`:

`Property 'cash' does not exist on type '{}'`

Root cause: TypeScript inferred the `Map` value type as `{}`.

Fix: explicitly type the historical monthly dataset and map as `any[]` / `Map<string, any>`.

No database migration required.
