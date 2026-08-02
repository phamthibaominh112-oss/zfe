-- 1) Create the first user in Supabase Dashboard > Authentication > Users.
-- 2) Replace the email below, then run this SQL once.

update public.profiles p
set role = 'admin', is_active = true, updated_at = now()
from auth.users u
where p.id = u.id and lower(u.email) = lower('REPLACE_WITH_ADMIN_EMAIL');

-- Verify:
select u.email, p.full_name, p.role, p.is_active
from auth.users u join public.profiles p on p.id = u.id
where lower(u.email) = lower('REPLACE_WITH_ADMIN_EMAIL');
