-- Repair databases where appointments_status_check predates the current
-- appointment statuses. Safe to run again in the Supabase SQL Editor.
alter table public.appointments
  drop constraint if exists appointments_status_check;

alter table public.appointments
  add constraint appointments_status_check
  check (status in ('Pending', 'Scheduled', 'Completed', 'Cancelled', 'No-Show'));

alter table public.appointments
  alter column status set default 'Pending';
