# ZE CenterOS v1.0.4 — Missing Supabase runtime guard

## Fixed
- A deployment without Supabase environment variables no longer returns `Internal Server Error`.
- `proxy.ts` now redirects to `/setup` before creating a Supabase client.
- Added a safe setup page showing which environment variable names are missing without exposing values.
- `/setup` automatically redirects to `/login` after the public Supabase variables are configured.

## Required Vercel environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SERVICE_ROLE_KEY` for Admin user management
- `NEXT_PUBLIC_APP_URL` recommended for password reset callbacks
