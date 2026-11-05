-- Rename the former Midwifery institute values to the current institute name.
-- Adds the institute column for databases that have not created it yet.

alter table public.users add column if not exists institute text;

update public.users
set institute = 'Institute of Health and Sciences (IHS)'
where institute in (
  'Institute of Midwifery',
  'Institute of Health and Sciences'
);
