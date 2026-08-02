# Deploy from a clean repository

The previous prototype/static repositories must not be reused unless every old file is removed. A stale `package.json`, lockfile, nested project folder, or old Vercel Root Directory can make Vercel build the wrong application.

## Required approach

1. Create a new empty GitHub repository.
2. Upload the contents of the production ZIP directly to the repository root.
3. Confirm the root contains `package.json`, `app/`, `lib/`, `supabase/`, and `vercel.json`.
4. Import that new repository as a new Vercel project.
5. Select Node.js 22 and root directory `./`.
6. Add the four environment variables from `.env.example`.
7. Run the Supabase migrations before first login.
8. Confirm GitHub Actions is green before adding live student/payment data.

The Vercel build log must report Next.js 16.2.12. It must not reference any old commit from the prototype repository.
