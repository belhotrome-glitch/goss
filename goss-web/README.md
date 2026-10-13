# GOSS — Guidance Office Support System (v2)

Client-side web app on **Supabase (Auth + Postgres)** — no backend server, the
browser talks directly to Supabase. This v2 upgrade preserves the original
UI/UX and page structure and adds an Admin Dashboard, secure real-time chat,
audit logging, and hardened Row Level Security. See "What changed" below for
the full list.

## Architecture (unchanged)
- **Auth**: Supabase Auth (email/password under the hood). No self-service
  sign-up, and **no example accounts or passwords are shipped in this
  codebase** — every account, including the first admin, is created directly
  in your own Supabase project. See `supabase/bootstrap.sql` and "Setup"
  below. Ongoing account activation/deactivation and role changes can then
  be done from the Admin → Users page in the app.
- **Database**: Postgres tables `users`, `concerns`, `messages`,
  `appointments`, `notifications`, plus new `audit_logs`, `announcements`,
  `feedback` tables. See `supabase/schema.sql`.
- **Frontend**: same static HTML pages, same shared `api()` helper in
  `assets/js/app.js` that mimics the original PHP endpoint shapes.
- Access control is enforced by Postgres **Row Level Security**, not
  server-side checks — this is the actual security boundary.

## What changed in v2

### Database / RLS (`supabase/schema.sql` — additive, safe to re-run)
- Added `admin` role and `is_active` account flag.
- Added CHECK constraints on `concerns.status`, `appointments.status`,
  `appointments.type` (previously free-text).
- Converted `appt_date`/`appt_time` to real `date`/`time` types, and added a
  partial **unique index** `(staff_id, appt_date, appt_time) WHERE status =
  'Scheduled'` — this blocks double-booking a counselor **at the database
  level**, not just in the UI.
- Added `audit_logs`, `announcements`, `feedback` tables with their own RLS.
- Added indexes on every column used in a filter/join (`student_id`,
  `staff_id`, `assigned_to`, `status`, `appt_date`, etc.).
- **Tightened `messages` RLS** — this was the biggest confidentiality gap in
  the original policy. Previously *any* staff account could read *any*
  concern's message thread. Now `can_access_case()` restricts message reads
  to: the student who owns the concern, staff while the concern is still
  unassigned (open for triage), the specific staff member it's assigned to,
  or an admin. Concern *metadata* (subject/status/category) is still visible
  to all staff so they can triage and claim cases.
- Enabled Supabase Realtime on `messages`, `notifications`, `concerns` — RLS
  applies to realtime subscriptions exactly as it does to normal queries, so
  a student cannot subscribe to another student's thread.

### Real-time chat
- Both concern-detail pages now open a `postgres_changes` subscription
  (`subscribeToConcernMessages`) so new replies appear live without a manual
  refresh, and unsubscribe cleanly on page unload.
- Read receipts: `read_at` is stamped when the other party opens the thread
  (`markMessagesRead`).
- Staff now explicitly **claim** an unassigned case (a button on the concern
  detail page) — once claimed, only that counselor (and admins) can read the
  thread going forward, matching the "assigned counselor" confidentiality
  model instead of an open free-for-all.

### Admin Dashboard (new)
- `admin-dashboard.html` — overview stats + recent activity feed.
- `admin-users.html` — search/filter users, activate/deactivate accounts,
  change roles (self-service role change / self-deactivation is blocked).
- `admin-concerns.html` — concern **metadata only** (status, category,
  assignment) — deliberately does **not** expose message content, per least
  privilege.
- `admin-appointments.html` — all appointments, filterable table.
- `admin-reports.html` — aggregate stats only: by-category, urgency,
  completed/cancelled/no-show counts, no-show rate, counselor workload,
  average resolution time. No individual case content.
- `admin-audit-logs.html` — latest 200 audit events (who did what, to which
  record, when — never message content, passwords, or tokens).

### Other additions
- `audit_logs` — write-only from the client (insert for your own user id
  only), admin-only read. Logged: login, logout, password change, concern
  created/updated, appointment created/status-changed, role/active-status
  changes, announcement create/delete, feedback submitted.
- `announcements` — staff publish (from `staff/announcements.html`), students see them on their
  dashboard. Admins do not manage announcements.
- `feedback` — students can rate a **Completed** appointment once
  (enforced in RLS via a subquery, not just the UI).
- `guidance-resources.html` — static academic/career/wellbeing/emergency
  resources page, linked from the student nav.
- Admin login is hidden from the public site: it lives at `/admindashboard/` (type `/admindashboard` after the site URL). There is no link to it anywhere.
- `supabase/bootstrap.sql` — template for creating your first admin account
  directly in Supabase (no credentials shipped in this repo — see Setup).

## Student / Staff / Admin permissions, in practice
- **Student**: sees only their own concerns, messages, appointments,
  notifications, and feedback. Enforced by RLS `student_id = auth.uid()` /
  `can_access_case()` — not by hiding buttons.
- **Staff**: sees all concern *metadata* to triage; can only read/send
  **messages** for cases that are unassigned or assigned to them; can update
  any concern's status; sees only their own appointments (not other
  counselors').
- **Admin**: full read/update on `users`; concern/appointment *metadata*
  visibility for management, but the same message-content restriction as
  staff applies (`can_access_case()` grants admins full access — this is an
  intentional, documented exception since admins need to investigate
  disputes; if you want admins fully excluded from message content, remove
  `public.is_admin()` from `can_access_case()`).

## Setup

### 1. Create a Supabase project
[supabase.com/dashboard](https://supabase.com/dashboard) → New project.

### 2. Run the schema
SQL Editor → paste `supabase/schema.sql` → Run. Safe to re-run on a database
that already has the v1 schema — it upgrades in place.

### 3. Configure the frontend
`assets/js/supabase-config.js` → set `SUPABASE_URL` and `SUPABASE_ANON_KEY`
from Project Settings → API. These are safe to be public (RLS is the actual
boundary) — **never** put the `service_role` key here or in any file the
browser can load.

### 4. Create your first account (admin) directly in Supabase
No example accounts or passwords are shipped in this codebase. Open
`supabase/bootstrap.sql` and follow Method A (Dashboard → Authentication →
Add user, then one SQL insert with your own name/email/ID number) to create
your own admin account, choosing your own password at creation time. Repeat
for any staff/student accounts you want to exist immediately; day-to-day
accounts should go through your school's real enrollment process afterward,
with role/activation changes handled from the Admin → Users page in the app.

## Environment variables
This is a build-less static site (no bundler), so **the browser cannot read
a `.env` file** — that only works for tooling that runs in Node.

| File | Purpose |
|---|---|
| `/.env` (project root, gitignored) | Local reference copy of `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` for any Node scripts you write yourself (see `supabase/bootstrap.sql` Method B) |
| `/.env.example` (committed) | Same keys as placeholders, safe to commit |
| `assets/js/supabase-config.js` | The only place the **frontend** actually reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` from — hand-copy these in |

**`SUPABASE_SERVICE_ROLE_KEY` must never appear in `supabase-config.js` or
any other file the browser loads** — it bypasses RLS entirely. `.gitignore`
already excludes `.env` from version control; double-check your deployment
host's publish directory is `goss-web/` (not the repo root) so `.env` is
never accidentally served as a static asset.

### 5. Run locally
Static site — any static file server works:
```bash
python3 -m http.server 8000
# or
npx serve .
```

### 6. Deploy online
Any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages, S3+CDN)
works since there's no server component. Requirements:
- Serve over **HTTPS** (all listed hosts do this by default).
- Add security headers where the host supports them (`Content-Security-Policy`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy`). Test any CSP against `cdn.jsdelivr.net` (Supabase
  JS SDK) before enabling it, or it will break login.
- Double-check `assets/js/supabase-config.js` only contains the anon key.

## Security testing performed
- Reviewed every RLS policy against the "Student A → Student B" and
  "unauthorized staff → confidential case" scenarios described in the
  original spec; rewrote `messages` policies to close the "any staff reads
  any case" gap.
- Verified IDOR is blocked at the RLS layer for `concerns`, `messages`,
  `appointments`, `feedback` (changing an `?id=` in the URL returns no rows
  instead of another user's data, because Postgres filters it out — this was
  spot-checked by policy logic, not against a live database, since none was
  provisioned in this environment).
- Confirmed the anon key in `supabase-config.js` is the *publishable* key,
  not a service-role key, and that no account credentials of any kind are
  committed anywhere in this codebase.
- Confirmed `esc()` is used for all user-generated content rendered into
  `innerHTML` across existing and new pages (concern subjects/descriptions,
  chat messages, names, announcement text).

**This was a code-level review, not a live penetration test against a
running instance** — no Supabase project was provisioned in this session.
Before going live, run through the full test matrix in your original spec
(§37) against a real staging project with two student accounts and two
staff accounts.

## Known limitations / recommended follow-ups
- `users` table RLS still allows any signed-in user to read **full rows**
  (not just name) for the directory feature (staff picker, display names).
  True column-level minimization needs a Postgres `view` exposing only
  `id, full_name, role, position` and switching the app to query that view
  instead of `users` directly — not done here to avoid touching every page
  that reads `usersMap`.
- `notifications` inserts are still "any signed-in user" (needed because the
  app writes notifications *to other users* during normal workflows, e.g. a
  student's concern notifies staff). The safer long-term fix is a
  `SECURITY DEFINER` Postgres RPC (`create_notification(...)`) that validates
  the event type server-side instead of trusting an arbitrary insert.
- There is no in-browser flow to **create** new staff/student accounts from
  the Admin dashboard (only activate/deactivate/change-role) — creating
  Supabase Auth users requires the service-role key, which must never reach
  the browser. Add a small Supabase Edge Function for this if self-service
  account creation is needed.
- No file/document upload feature exists in this codebase, so file-upload
  hardening (§22) doesn't apply yet — add it as its own reviewed feature if
  you introduce uploads later.
- No MFA on staff/admin accounts — Supabase Auth supports it, but enabling
  it is a dashboard/config change plus a small UI addition, not done here.
- Rate limiting / brute-force protection on login is whatever Supabase Auth
  provides by default; nothing custom was added.
- `created_at`/`updated_at`/`sent_at` remain `text` columns for backward
  compatibility with existing data and formatting code, rather than
  `timestamptz` — a larger migration than was practical to do safely without
  a live database to test against.

## Folder structure
Pages are now organized into per-role folders rather than flat
`role-page.html` filenames:
```
/index.html                    Landing page (Student / Staff login links only)
/admindashboard/               Admin login (reachable only by typing the URL)
/student/                      Student portal
  dashboard.html, concerns.html, concern-detail.html,
  submit.html, appointments.html
/staff/                        Staff/counselor portal
  dashboard.html, concerns.html, concern-detail.html,
  appointments.html, reports.html, profile.html, announcements.html
/admin/                        Admin dashboard (new)
  dashboard.html, users.html, concerns.html, appointments.html,
  reports.html, audit-logs.html
/shared/                       Pages any signed-in role can reach
  notifications.html, guidance-resources.html
/assets/css/style.css          Styling (unchanged)
/assets/js/supabase-config.js  Supabase project URL + anon key
/assets/js/app.js              Data layer + audit logging + realtime helpers
/assets/js/shell.js            Sidebar/topbar (student/staff/admin nav)
/supabase/schema.sql           Schema + RLS (v2, additive migration)
/supabase/bootstrap.sql        Template for creating your first admin (no credentials shipped)
/.env, /.env.example           Local config (see Environment variables)
```

Every page except the root `index.html` sets `window.ROOT_PATH = "../"`
inline (before loading `app.js`) so shared JS can build correct relative
links back to `index.html` and across role folders regardless of which
page is currently open — see `assets/js/shell.js` and the `requireAuth()` /
`logout()` redirects in `assets/js/app.js`. If you add new pages under a
role folder, copy that same `<script>window.ROOT_PATH = "../";</script>`
line before the `supabase-config.js` include.

