-- Allow staff to record an actual walk-in Guidance Office visit.
-- Safe to run repeatedly in the Supabase SQL Editor.
drop policy if exists "appointments_staff_record_office_visit" on public.appointments;
create policy "appointments_staff_record_office_visit" on public.appointments
  for insert to authenticated with check (
    public.my_role() = 'staff'
    and staff_id = auth.uid()
    and type = 'In-Person'
    and status = 'Completed'
    and location = 'Guidance Office'
    and exists (
      select 1
      from public.users as student
      where student.id = appointments.student_id
        and student.role = 'student'
    )
  );
