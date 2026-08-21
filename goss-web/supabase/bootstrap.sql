-- ============================================================================
-- GOSS — Bootstrap the first account(s) directly in Supabase
--
-- No account credentials are shipped in this codebase. Create every account
-- (including the first admin) yourself, directly in your own Supabase
-- project, using one of the two methods below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Method A — Dashboard (recommended, no SQL needed for the auth part)
-- ----------------------------------------------------------------------------
-- 1. Supabase Dashboard → Authentication → Users → "Add user"
--    - Email: any address you control, or a placeholder like
--      admin@yourschool.edu (GOSS logs in with an ID number, which the
--      frontend maps to an email internally — see index.html for the
--      id-to-email pattern already used there).
--    - Password: choose your own strong password. Set it here — never
--      commit it anywhere.
--    - Copy the new user's UUID once created.
-- 2. Run the INSERT below in SQL Editor, replacing every <PLACEHOLDER>.

insert into public.users (id, full_name, email, role, user_id_no, position, created_at)
values (
  '<PASTE-AUTH-USER-UUID-HERE>',
  '<Full Name>',
  '<same email used in Authentication → Users>',
  'admin',                    -- 'student' | 'staff' | 'admin'
  '<ID-NUMBER>',               -- e.g. ADM001 — whatever the login screen expects
  'System Administrator',      -- optional, used for staff/admin display
  to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ----------------------------------------------------------------------------
-- Method B — SQL only, using auth.admin from a trusted context
-- ----------------------------------------------------------------------------
-- If you'd rather script this (e.g. a one-off local Node REPL using the
-- service_role key), call supabase.auth.admin.createUser({ email, password })
-- yourself with credentials only you know, then insert the matching row
-- into public.users as in Method A. This project intentionally does not
-- ship a seed script with example accounts/passwords — write that small
-- script yourself, run it once locally, and delete it. Never commit a
-- script that contains real or example passwords.
--
-- Minimal outline (fill in your own values, do not commit this file with
-- real values in it):
--
--   const { createClient } = require('@supabase/supabase-js');
--   const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
--   const { data } = await admin.auth.admin.createUser({
--     email: '<you choose>', password: '<you choose>', email_confirm: true,
--   });
--   // then run the SQL insert above with data.user.id

-- ----------------------------------------------------------------------------
-- Creating additional staff/student accounts later
-- ----------------------------------------------------------------------------
-- Once you have one admin account, day-to-day account creation should go
-- through your school's actual enrollment process. The Admin → Users page
-- in the app can activate/deactivate accounts and change roles, but does
-- NOT create new Supabase Auth users from the browser (that requires the
-- service_role key, which must never reach client-side code) — use Method A
-- or B above for each new account, or build a small internal Edge Function
-- if you need self-service account creation at scale.
