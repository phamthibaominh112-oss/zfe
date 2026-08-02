# ZE CenterOS — Bulk Auth Account Import

This package creates Supabase Auth accounts and links them to the existing `public.teachers` and `public.students` records.

## Generated account set

- 7 teacher rows
- 13 student rows
- Mr. Phong retains the already-known email `giaovien@gmail.com` and is linked/skipped rather than duplicated.

## Important limitations of the requested naming rule

The requested pattern was `name@mail.com` with password equal to the normalized name. Two production issues were handled:

1. Teacher **Minh** and student **Minh** would collide, so the student becomes `minh.hv@mail.com`.
2. Passwords shorter than 6 characters are extended with `123`, for example `nga123`, `nam123`, `minh123`.

`mail.com` is a real public email domain. These addresses should only be temporary. For a real launch, use a domain controlled by ZEST so password recovery cannot be delivered to unrelated third parties.

## Do not upload the accounts CSV into Table Editor

Supabase Auth users are not ordinary rows in `public` tables. They must be created through the server-side Admin API. The supplied script uses `auth.admin.createUser()`, then upserts `profiles` and links `teachers.user_id` / `students.user_id`.

## Run it

1. Copy this folder into the root of the ZE CenterOS repository, or run it as a separate local folder that has `@supabase/supabase-js` installed.
2. Copy the env template:

```bash
cp .env.bulk-auth.example .env.bulk-auth
```

3. Put the Supabase secret key into `.env.bulk-auth`. Never upload this file to GitHub.
4. Run a dry run first:

```bash
node scripts/create-auth-accounts.mjs
```

5. Review the output. Then create and link the accounts:

```bash
node scripts/create-auth-accounts.mjs --apply
```

6. Open Supabase SQL Editor and run `scripts/verify-auth-links.sql`.

## Existing or duplicate users

- If the email already exists in Auth, the script links that user instead of creating another account.
- If a teacher/student record is already linked to a different Auth user, the script stops that row rather than overwriting it.
- `--force-relink` exists, but only use it after checking the current link manually.

## Security after import

The passwords in the CSV are temporary and predictable. Distribute them privately, require users to change them immediately, and delete the credential CSV after onboarding. Do not send the entire file to staff or students.
