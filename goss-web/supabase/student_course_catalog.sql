-- Accept any student course name while trimming accidental surrounding spaces.
-- Existing course values are not changed by this migration.

drop trigger if exists users_validate_student_course on public.users;
drop function if exists public.validate_student_course();

create or replace function public.normalize_student_course()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'student' and new.course is not null then
    new.course := nullif(btrim(new.course), '');
  end if;

  return new;
end;
$$;

drop trigger if exists users_normalize_student_course on public.users;
create trigger users_normalize_student_course
before insert or update of role, course on public.users
for each row
execute function public.normalize_student_course();
