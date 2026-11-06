-- Allow all staff to read and reply in any concern chat, including concerns
-- assigned to another staff member. Students remain limited to their own
-- concerns, and admins retain access.
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
        and (c.student_id = auth.uid() or public.is_staff())
    );
$$;
