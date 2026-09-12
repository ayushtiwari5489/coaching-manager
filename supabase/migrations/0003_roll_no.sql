-- Adds roll_no to students (shown on attendance rosters, class lists and exports).
alter table public.students
  add column if not exists roll_no text default null;

create index if not exists students_roll_no_idx on public.students (roll_no);