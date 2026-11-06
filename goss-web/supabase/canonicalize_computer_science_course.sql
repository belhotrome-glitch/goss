-- Use the full official degree name for existing computer science student records.
-- Run this in Supabase Dashboard -> SQL Editor.

update public.users
set course = 'Bachelor of Science in Computer Science'
where role = 'student'
  and lower(btrim(course)) in (
    'bs computer science',
    'bscs',
    'bachelor of science in computer science (bscs)'
  );
