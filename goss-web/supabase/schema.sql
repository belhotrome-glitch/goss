-- ============================================================================
-- GOSS — Supabase schema + Row Level Security
-- Run this once in Supabase Dashboard → SQL Editor (or `supabase db push`).
--
-- This file is ADDITIVE / idempotent: it can be re-run safely on a database
-- that already has the original GOSS schema. It upgrades the original
-- schema in place — it does not drop or replace unrelated tables/data.
--
-- v2 changes vs the original schema (see README "Security & Upgrade Notes"):
--   - Adds an `admin` role and `is_active` account flag
--   - Adds CHECK constraints on status/category enums (was free-text)
--   - Converts appointment date/time to real `date`/`time` columns and adds
--     a partial UNIQUE index that blocks double-booking at the DB level
--   - Adds `audit_logs`, `announcements`, `feedback` tables
--   - Scopes message access so students see their own threads and staff can
--     collaborate across all concern threads
--   - Adds an admin-aware role helper and admin-only policies
--   - Adds indexes for all frequently-filtered columns
-- ============================================================================

-- ---- users ------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null check (role in ('student', 'staff')),
  user_id_no text,
  position text,
  course text,
  created_at text not null
);

alter table public.users add column if not exists course text;

-- v2: admin role + account activation flag
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('student', 'staff', 'admin'));
alter table public.users add column if not exists is_active boolean not null default true;
alter table public.users add column if not exists deactivated_at text;

create table if not exists public.concerns (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  subject text not null,
  description text not null,
  is_anonymous boolean not null default false,
  is_urgent boolean not null default false,
  status text not null default 'Pending',
  assigned_to uuid references public.users(id) on delete set null,
  created_at text not null,
  updated_at text not null
);

-- v2: enforce the status enum at the DB layer (previously free-text)
alter table public.concerns drop constraint if exists concerns_status_check;
alter table public.concerns add constraint concerns_status_check
  check (status in ('Pending', 'In Progress', 'Resolved', 'Closed'));
alter table public.concerns add column if not exists resolved_at text;

-- A concern can have multiple conversations as its assigned staff changes.
create table if not exists public.concern_conversations (
  id uuid primary key default gen_random_uuid(),
  concern_id uuid not null references public.concerns(id) on delete cascade,
  assigned_staff_id uuid references public.users(id) on delete set null,
  assigned_at text,
  started_at text not null,
  ended_at text,
  ended_by uuid references public.users(id) on delete set null
);
create unique index if not exists idx_concern_conversations_active
  on public.concern_conversations(concern_id) where ended_at is null;
create index if not exists idx_concern_conversations_concern
  on public.concern_conversations(concern_id, started_at);

-- ---- concern conversations and messages -------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  concern_id uuid not null references public.concerns(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  sent_at text not null
);

-- v2: read receipts + soft delete for the real-time chat upgrade
alter table public.messages add column if not exists read_at text;
alter table public.messages add column if not exists deleted_at text;
alter table public.messages add column if not exists conversation_id uuid
  references public.concern_conversations(id) on delete cascade;

-- Preserve existing messages by placing each concern's current transcript
-- into its initial conversation before making conversation_id mandatory.
alter table public.concern_conversations add column if not exists assigned_at text;
insert into public.concern_conversations (concern_id, assigned_staff_id, assigned_at, started_at)
select c.id, c.assigned_to,
  case when c.assigned_to is null then null else c.created_at end,
  c.created_at
from public.concerns c
where not exists (
  select 1 from public.concern_conversations cc
  where cc.concern_id = c.id and cc.ended_at is null
);
update public.concern_conversations
set assigned_at = started_at
where assigned_staff_id is not null and assigned_at is null;
update public.messages m
set conversation_id = cc.id
from public.concern_conversations cc
where cc.concern_id = m.concern_id
  and cc.ended_at is null
  and m.conversation_id is null;
alter table public.messages alter column conversation_id set not null;

-- ---- appointments -------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  staff_id uuid not null references public.users(id) on delete cascade,
  appt_date text not null,
  appt_time text not null,
  type text not null default 'In-Person',
  notes text,
  location text,
  status text not null default 'Scheduled',
  created_at text not null
);

-- v2: use real date/time types instead of free text (safe cast — existing
-- values were already stored as 'YYYY-MM-DD' / 'HH:MM' strings)
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'appointments' and column_name = 'appt_date') = 'text' then
    alter table public.appointments alter column appt_date type date using appt_date::date;
  end if;
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'appointments' and column_name = 'appt_time') = 'text' then
    alter table public.appointments alter column appt_time type time using appt_time::time;
  end if;
end $$;

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check
  check (status in ('Pending', 'Scheduled', 'Completed', 'Cancelled', 'No-Show'));
alter table public.appointments drop constraint if exists appointments_type_check;
alter table public.appointments add constraint appointments_type_check
  check (type in ('In-Person', 'Virtual'));

-- v2.1: student-booked appointments start as 'Pending' until a staff member
-- accepts (or reschedules) them. Staff-booked appointments are confirmed
-- immediately (see appointments_insert policy + app.js handleAppointments).
alter table public.appointments alter column status set default 'Pending';

-- v2: prevent double-booking the same counselor at the same date/time for
-- any appointment that is still active (Pending or Scheduled).
drop index if exists appointments_no_double_book;
create unique index appointments_no_double_book
  on public.appointments (staff_id, appt_date, appt_time)
  where status in ('Pending', 'Scheduled');

-- ---- notifications ------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at text not null,
  event_type text
);

-- ---- audit_logs (v2) -----------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb,
  created_at text not null default to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
);

-- ---- announcements (v2) ---------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid references public.users(id) on delete set null,
  is_published boolean not null default true,
  created_at text not null
);

-- ---- feedback (v2) --------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  feedback text,
  created_at text not null,
  unique (appointment_id)
);

-- ============================================================================
-- Indexes (v2) — frequently filtered/joined columns
-- ============================================================================
create index if not exists idx_concerns_student on public.concerns(student_id);
create index if not exists idx_concerns_assigned on public.concerns(assigned_to);
create index if not exists idx_concerns_status on public.concerns(status);
create index if not exists idx_concerns_created on public.concerns(created_at);
create index if not exists idx_messages_concern on public.messages(concern_id);
create index if not exists idx_messages_sender on public.messages(sender_id);
create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_appointments_student on public.appointments(student_id);
create index if not exists idx_appointments_staff on public.appointments(staff_id);
create index if not exists idx_appointments_date on public.appointments(appt_date);
create index if not exists idx_appointments_status on public.appointments(status);
create index if not exists idx_notifications_user on public.notifications(user_id, is_read);
create index if not exists idx_audit_logs_user on public.audit_logs(user_id);
create index if not exists idx_audit_logs_created on public.audit_logs(created_at);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.users enable row level security;
alter table public.concerns enable row level security;
alter table public.concern_conversations enable row level security;
alter table public.messages enable row level security;
alter table public.appointments enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.announcements enable row level security;
alter table public.feedback enable row level security;

-- helper: current user's role, without recursive RLS lookups
create or replace function public.my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.my_role() in ('staff', 'admin'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.my_role() = 'admin', false);
$$;

-- Can the caller access this case's messages? The owning student, any staff
-- member, or an admin can read and reply; message rows retain each sender's ID.
create or replace function public.can_access_case(p_concern_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.concerns c
      where c.id = p_concern_id
        and (c.student_id = auth.uid()
             or public.is_staff())
    );
$$;

create or replace function public.can_reply_to_conversation(p_conversation_id uuid, p_concern_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.concern_conversations cc
    where cc.id = p_conversation_id
      and cc.concern_id = p_concern_id
      and cc.ended_at is null
      and public.can_access_case(p_concern_id)
  );
$$;

create or replace function public.can_read_conversation(p_conversation_id uuid, p_concern_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.concern_conversations cc
    where cc.id = p_conversation_id
      and cc.concern_id = p_concern_id
      and (
        public.is_staff()
        or (
          cc.ended_at is null
          and exists (
            select 1 from public.concerns c
            where c.id = p_concern_id and c.student_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.reassign_concern(p_concern_id uuid, p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_concern public.concerns%rowtype;
  v_conversation public.concern_conversations%rowtype;
  v_staff_name text;
  v_conversation_id uuid;
  v_now text := to_char(now(), 'YYYY-MM-DD HH24:MI:SS');
  v_restarted boolean := false;
begin
  if coalesce(public.my_role(), '') <> 'staff' then
    raise exception 'Only staff can assign a concern';
  end if;

  select * into v_concern
  from public.concerns
  where id = p_concern_id
  for update;
  if not found then
    raise exception 'Concern not found';
  end if;

  select full_name into v_staff_name
  from public.users
  where id = p_staff_id and role = 'staff' and is_active is distinct from false;
  if not found then
    raise exception 'Choose a valid staff member';
  end if;

  select * into v_conversation
  from public.concern_conversations
  where concern_id = p_concern_id and ended_at is null
  for update;

  if v_concern.assigned_to is distinct from p_staff_id then
    if v_conversation.id is not null and v_concern.assigned_to is not null then
      update public.concern_conversations
      set ended_at = v_now, ended_by = auth.uid()
      where id = v_conversation.id;
      insert into public.concern_conversations (concern_id, assigned_staff_id, assigned_at, started_at)
      values (p_concern_id, p_staff_id, v_now, v_now)
      returning id into v_conversation_id;
      v_restarted := true;
    elsif v_conversation.id is not null then
      update public.concern_conversations
      set assigned_staff_id = p_staff_id, assigned_at = v_now
      where id = v_conversation.id
      returning id into v_conversation_id;
    else
      insert into public.concern_conversations (concern_id, assigned_staff_id, assigned_at, started_at)
      values (p_concern_id, p_staff_id, v_now, v_now)
      returning id into v_conversation_id;
      v_restarted := v_concern.assigned_to is not null;
    end if;

    update public.concerns
    set assigned_to = p_staff_id, updated_at = v_now
    where id = p_concern_id;

    insert into public.notifications (user_id, title, body, is_read, created_at, event_type)
    values (
      v_concern.student_id,
      'Concern Assigned',
      'Your concern "' || v_concern.subject || '" has been assigned to ' || v_staff_name ||
        case when v_restarted then '. A new conversation has been started.' else '.' end,
      false,
      v_now,
      'concern_assigned'
    );
  else
    v_conversation_id := v_conversation.id;
    if v_conversation_id is null then
      insert into public.concern_conversations (concern_id, assigned_staff_id, assigned_at, started_at)
      values (p_concern_id, p_staff_id, v_now, v_now)
      returning id into v_conversation_id;
    end if;
  end if;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'conversation_restarted', v_restarted
  );
end;
$$;

-- ============================================================================
-- users
-- ============================================================================
drop policy if exists "users_select_signed_in" on public.users;
drop policy if exists "users_select_directory" on public.users;
drop policy if exists "users_select_self_or_admin" on public.users;
-- Everyone signed in can see a minimal directory (needed for staff pickers,
-- concern/appointment display names). True column-level minimisation needs
-- a view (see README limitations); admin gets unrestricted read.
create policy "users_select_self_or_admin" on public.users
  for select using (auth.uid() = id or public.is_admin());
create policy "users_select_directory" on public.users
  for select using (auth.uid() is not null);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.users where id = auth.uid()));

drop policy if exists "users_admin_update" on public.users;
create policy "users_admin_update" on public.users
  for update using (public.is_admin());

drop policy if exists "users_admin_insert" on public.users;
create policy "users_admin_insert" on public.users
  for insert with check (public.is_admin());

-- ============================================================================
-- concerns
-- ============================================================================
drop policy if exists "concerns_select" on public.concerns;
create policy "concerns_select" on public.concerns
  for select using (student_id = auth.uid() or public.is_staff());

drop policy if exists "concerns_insert" on public.concerns;
create policy "concerns_insert" on public.concerns
  for insert with check (public.my_role() = 'student' and student_id = auth.uid());

drop policy if exists "concerns_update" on public.concerns;
-- students may only edit their own concern while it's still Pending;
-- staff/admin may update any concern for triage/assignment/status changes.
create policy "concerns_update" on public.concerns
  for update using (student_id = auth.uid() or public.is_staff())
  with check (
    public.is_staff()
    or (student_id = auth.uid() and status = 'Pending')
  );

-- ============================================================================
-- messages — accessible to the student who owns the concern and all staff
-- ============================================================================
drop policy if exists "concern_conversations_select" on public.concern_conversations;
create policy "concern_conversations_select" on public.concern_conversations
  for select using (
    public.is_staff()
    or (
      ended_at is null
      and exists (
        select 1 from public.concerns c
        where c.id = concern_id and c.student_id = auth.uid()
      )
    )
  );

drop policy if exists "concern_conversations_insert" on public.concern_conversations;
create policy "concern_conversations_insert" on public.concern_conversations
  for insert with check (
    public.is_staff()
    or exists (
      select 1 from public.concerns c
      where c.id = concern_id and c.student_id = auth.uid()
    )
  );

drop policy if exists "concern_conversations_update" on public.concern_conversations;
create policy "concern_conversations_update" on public.concern_conversations
  for update using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (public.can_read_conversation(conversation_id, concern_id));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.can_reply_to_conversation(conversation_id, concern_id)
  );

drop policy if exists "messages_update_read_receipt" on public.messages;
create policy "messages_update_read_receipt" on public.messages
  for update using (public.can_reply_to_conversation(conversation_id, concern_id))
  with check (public.can_reply_to_conversation(conversation_id, concern_id));

revoke all on function public.reassign_concern(uuid, uuid) from public;
grant execute on function public.reassign_concern(uuid, uuid) to authenticated;

-- ============================================================================
-- appointments
-- ============================================================================
drop policy if exists "appointments_select" on public.appointments;
create policy "appointments_select" on public.appointments
  for select using (student_id = auth.uid() or staff_id = auth.uid() or public.is_admin());

-- v2.1: students can book for themselves; staff can book on behalf of a
-- student too (walk-ins, phone calls, follow-ups they initiate).
drop policy if exists "appointments_insert" on public.appointments;
create policy "appointments_insert" on public.appointments
  for insert with check (
    (public.my_role() = 'student' and student_id = auth.uid())
    or (public.my_role() = 'staff' and staff_id = auth.uid())
  );

drop policy if exists "appointments_update" on public.appointments;
create policy "appointments_update" on public.appointments
  for update using (student_id = auth.uid() or staff_id = auth.uid() or public.is_admin());

-- ============================================================================
-- notifications — owner-only reads. Inserts remain "any signed-in user"
-- because the app writes notifications to OTHER users during normal
-- workflows (e.g. student submits concern → notifies staff). This is a
-- known trade-off, not a full fix — see README limitations for the
-- recommended follow-up (move writes into a SECURITY DEFINER RPC).
-- ============================================================================
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "notifications_insert_signed_in" on public.notifications;
create policy "notifications_insert_signed_in" on public.notifications
  for insert with check (auth.uid() is not null);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());

-- ============================================================================
-- audit_logs — write-only from the app (insert for your own user_id only);
-- readable by admins only. Never contains passwords/tokens (app-enforced).
-- ============================================================================
drop policy if exists "audit_logs_insert_own" on public.audit_logs;
create policy "audit_logs_insert_own" on public.audit_logs
  for insert with check (user_id = auth.uid() or user_id is null);

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs
  for select using (public.is_admin());

-- ============================================================================
-- announcements — staff publish, everyone signed-in reads published
-- ============================================================================
drop policy if exists "announcements_select" on public.announcements;
create policy "announcements_select" on public.announcements
  for select using (is_published = true or public.is_staff());

drop policy if exists "announcements_write" on public.announcements;
create policy "announcements_write" on public.announcements
  for insert with check (public.my_role() = 'staff');

drop policy if exists "announcements_update" on public.announcements;
create policy "announcements_update" on public.announcements
  for update using (public.my_role() = 'staff');

drop policy if exists "announcements_delete" on public.announcements;
create policy "announcements_delete" on public.announcements
  for delete using (public.my_role() = 'staff');

-- ============================================================================
-- feedback — a student may only create feedback for their OWN completed
-- appointment; staff/admin may read for reporting.
-- ============================================================================
drop policy if exists "feedback_select" on public.feedback;
create policy "feedback_select" on public.feedback
  for select using (student_id = auth.uid() or public.is_staff());

drop policy if exists "feedback_insert_own_completed_appt" on public.feedback;
create policy "feedback_insert_own_completed_appt" on public.feedback
  for insert with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.id = appointment_id
        and a.student_id = auth.uid()
        and a.status = 'Completed'
    )
  );

-- ============================================================================
-- Realtime — RLS above still applies to every realtime read/subscription.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'concern_conversations'
  ) then
    alter publication supabase_realtime add table public.concern_conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'concerns'
  ) then
    alter publication supabase_realtime add table public.concerns;
  end if;
end $$;
