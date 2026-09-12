-- ============================================================================
-- COACHING MANAGER — Single-institute private management system
-- PostgreSQL / Supabase schema (v1)
--
-- Portable, standard PostgreSQL. Can be run on any PostgreSQL 14+ server.
-- Stable string IDs (STU-00001, TCH-00001, ...) are preserved through
-- export/import so relationships survive migration.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- ID generation: sequences + generic BEFORE INSERT trigger
-- ---------------------------------------------------------------------------
create sequence if not exists public.seq_stu start 1;
create sequence if not exists public.seq_tch start 1;
create sequence if not exists public.seq_bat start 1;
create sequence if not exists public.seq_sch start 1;
create sequence if not exists public.seq_cls start 1;
create sequence if not exists public.seq_att start 1;
create sequence if not exists public.seq_fee start 1;
create sequence if not exists public.seq_pay start 1;
create sequence if not exists public.seq_rec start 1;
create sequence if not exists public.seq_log start 1;
create sequence if not exists public.seq_bak start 1;

create or replace function public.auto_id()
returns trigger
language plpgsql
as $$
declare
  v_seq text := case TG_TABLE_NAME
    when 'students'       then 'seq_stu' when 'teachers'       then 'seq_tch'
    when 'batches'        then 'seq_bat' when 'class_schedules' then 'seq_sch'
    when 'classes'        then 'seq_cls' when 'attendance'      then 'seq_att'
    when 'fee_records'    then 'seq_fee' when 'payments'        then 'seq_pay'
    when 'receipts'       then 'seq_rec' when 'audit_logs'      then 'seq_log'
    when 'backups'        then 'seq_bak' else null end;
  v_prefix text := case TG_TABLE_NAME
    when 'students' then 'STU' when 'teachers' then 'TCH' when 'batches' then 'BAT'
    when 'class_schedules' then 'SCH' when 'classes' then 'CLS' when 'attendance' then 'ATT'
    when 'fee_records' then 'FEE' when 'payments' then 'PAY' when 'receipts' then 'REC'
    when 'audit_logs' then 'LOG' when 'backups' then 'BAK' else null end;
  v_num bigint;
begin
  if v_seq is null then
    raise exception 'auto_id: no sequence configured for table %', TG_TABLE_NAME;
  end if;
  if NEW.id is null then
    execute format('select nextval(%L)', v_seq) into v_num;
    NEW.id := v_prefix || '-' || lpad(v_num::text, 5, '0');
  end if;
  return NEW;
end;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles & access helpers (used by RLS policies)
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','teacher')),
  teacher_id text references public.teachers(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'admin' from public.user_profiles where user_id = auth.uid()), false) $$;

create or replace function public.current_teacher_id()
returns text language sql stable security definer set search_path = public as
$$ select teacher_id from public.user_profiles where user_id = auth.uid() and role = 'teacher' $$;

create or replace function public.teacher_of_batch(p_batch_id text)
returns boolean language sql stable security definer set search_path = public as
$$ select exists (
  select 1 from public.teacher_batches tb
  where tb.batch_id = p_batch_id and tb.teacher_id = public.current_teacher_id()) $$;

-- ---------------------------------------------------------------------------
-- institute_profile — single source of truth for institute identity (1 row)
-- ---------------------------------------------------------------------------
create table if not exists public.institute_profile (
  id               text       primary key default 'main' check (id = 'main'),
  institute_name   text       not null default '[YOUR INSTITUTE NAME]',
  short_name       text       not null default '[SHORT NAME]',
  tagline          text       default '[YOUR TAGLINE]',
  logo_url         text       default null,
  phone            text       default '[INSTITUTE PHONE NUMBER]',
  whatsapp         text       default '[WHATSAPP NUMBER]',
  email            text       default '[INSTITUTE EMAIL]',
  website          text       default '[INSTITUTE WEBSITE]',
  address          text       default '[FULL INSTITUTE ADDRESS]',
  locality         text       default '[AREA / LOCALITY]',
  city             text       default '[CITY]',
  state            text       default '[STATE]',
  pincode          text       default '[PIN CODE]',
  courses          text       default '[COURSES / SUBJECTS]',
  classes          text       default '[CLASSES / GRADES]',
  academic_session text       default '[ACADEMIC SESSION]',
  timezone         text       not null default 'Asia/Kolkata',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into public.institute_profile (id) values ('main') on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- admin_profile — private admin contact info, hidden from teachers/anon
-- ---------------------------------------------------------------------------
create table if not exists public.admin_profile (
  id          text primary key default 'main' check (id = 'main'),
  admin_name  text default '[ADMIN NAME]',
  admin_phone text default '[ADMIN PHONE]',
  admin_email text default '[ADMIN EMAIL]',
  updated_at  timestamptz not null default now()
);

insert into public.admin_profile (id) values ('main') on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- teachers
-- ---------------------------------------------------------------------------
create table if not exists public.teachers (
  id         text primary key,
  name       text not null,
  phone      text,
  email      text,
  subject    text,
  status     text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  user_id    uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists teachers_email_key on public.teachers (email) where email is not null;
create index if not exists teachers_status_idx on public.teachers (status);

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  id            text primary key,
  name          text not null,
  phone         text,
  parent_name   text,
  parent_phone  text,
  email         text,
  address       text,
  course        text,
  admission_date date,
  monthly_fee   numeric(12,2) not null default 0 check (monthly_fee >= 0),
  status        text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','COMPLETED')),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists students_name_idx on public.students (lower(name));
create index if not exists students_status_idx on public.students (status);
create index if not exists students_phone_idx on public.students (phone);

-- ---------------------------------------------------------------------------
-- batches
-- ---------------------------------------------------------------------------
create table if not exists public.batches (
  id         text primary key,
  name       text not null,
  subject    text,
  days       smallint[] not null default '{}'::smallint[],
  start_time time,
  end_time   time,
  room       text,
  status     text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists batches_status_idx on public.batches (status);

-- teacher <-> batch assignment
create table if not exists public.teacher_batches (
  teacher_id text not null references public.teachers(id) on delete cascade,
  batch_id   text not null references public.batches(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (teacher_id, batch_id)
);
create index if not exists teacher_batches_batch_idx on public.teacher_batches (batch_id);

-- student <-> batch enrollment
create table if not exists public.batch_students (
  batch_id   text not null references public.batches(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  status     text not null default 'ACTIVE' check (status in ('ACTIVE','REMOVED')),
  joined_at  date not null default current_date,
  left_at    date,
  primary key (batch_id, student_id)
);
create index if not exists batch_students_student_idx on public.batch_students (student_id);

-- ---------------------------------------------------------------------------
-- class_schedules — recurring weekly schedule for a batch
-- ---------------------------------------------------------------------------
create table if not exists public.class_schedules (
  id         text primary key,
  batch_id   text not null references public.batches(id) on delete cascade,
  teacher_id text references public.teachers(id) on delete set null,
  days       smallint[] not null default '{}'::smallint[],
  start_time time not null,
  end_time   time not null,
  room       text,
  status     text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists class_schedules_batch_idx on public.class_schedules (batch_id);

-- ---------------------------------------------------------------------------
-- classes — individual class instances (auto-materialised from schedules)
-- ---------------------------------------------------------------------------
create table if not exists public.classes (
  id                   text primary key,
  schedule_id          text references public.class_schedules(id) on delete set null,
  batch_id             text not null references public.batches(id) on delete cascade,
  teacher_id           text references public.teachers(id) on delete set null,
  class_date           date not null,
  start_time           time,
  end_time             time,
  room                 text,
  status               text not null default 'SCHEDULED' check (status in ('SCHEDULED','COMPLETED','CANCELLED')),
  attendance_submitted boolean not null default false,
  submitted_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (batch_id, class_date, start_time)
);
create index if not exists classes_class_date_idx on public.classes (class_date);
create index if not exists classes_batch_date_idx on public.classes (batch_id, class_date);
create index if not exists classes_teacher_date_idx on public.classes (teacher_id, class_date);

-- ---------------------------------------------------------------------------
-- attendance — one row per student per class per date
-- Unique constraint prevents duplicate attendance for
-- same student + same class + same date.
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id                text primary key,
  student_id        text not null references public.students(id) on delete cascade,
  batch_id          text references public.batches(id) on delete cascade,
  teacher_id        text references public.teachers(id) on delete set null,
  class_id          text references public.classes(id) on delete cascade,
  attendance_date   date not null,
  attendance_status text not null check (attendance_status in ('PRESENT','ABSENT','LATE','LEAVE')),
  submitted_at      timestamptz not null default now(),
  corrected_by      uuid references auth.users(id) on delete set null,
  corrected_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (student_id, class_id, attendance_date)
);
create index if not exists attendance_student_idx on public.attendance (student_id, attendance_date);
create index if not exists attendance_batch_idx on public.attendance (batch_id, attendance_date);
create index if not exists attendance_teacher_idx on public.attendance (teacher_id, attendance_date);
create index if not exists attendance_class_idx on public.attendance (class_id);
create index if not exists attendance_date_idx on public.attendance (attendance_date);

-- ---------------------------------------------------------------------------
-- fee_records — one record per student per month
-- ---------------------------------------------------------------------------
create table if not exists public.fee_records (
  id         text primary key,
  student_id text not null references public.students(id) on delete cascade,
  fee_month  date not null check (date_trunc('month', fee_month) = fee_month),
  amount     numeric(12,2) not null check (amount >= 0),
  due_date   date,
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status     text not null default 'PENDING' check (status in ('PAID','PARTIAL','PENDING','OVERDUE')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, fee_month)
);
create index if not exists fee_records_student_idx on public.fee_records (student_id);
create index if not exists fee_records_month_idx on public.fee_records (fee_month);
create index if not exists fee_records_status_idx on public.fee_records (status);

-- ---------------------------------------------------------------------------
-- payments — append-only financial history
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id           text primary key,
  student_id   text not null references public.students(id) on delete cascade,
  fee_record_id text not null references public.fee_records(id) on delete cascade,
  payment_date date not null,
  amount       numeric(12,2) not null check (amount > 0),
  method       text not null check (method in ('CASH','UPI','BANK_TRANSFER','OTHER')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists payments_student_idx on public.payments (student_id);
create index if not exists payments_date_idx on public.payments (payment_date);
create index if not exists payments_fee_idx on public.payments (fee_record_id);

-- ---------------------------------------------------------------------------
-- receipts — one per payment, unique receipt numbers
-- ---------------------------------------------------------------------------
create table if not exists public.receipts (
  id            text primary key,
  receipt_number text not null unique,
  payment_id    text not null references public.payments(id) on delete cascade,
  student_id    text not null references public.students(id) on delete cascade,
  fee_record_id text references public.fee_records(id) on delete set null,
  receipt_date  date not null,
  amount        numeric(12,2) not null,
  method        text,
  received_by   text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists receipts_payment_idx on public.receipts (payment_id);
create index if not exists receipts_student_idx on public.receipts (student_id);

-- ---------------------------------------------------------------------------
-- audit_logs — who did what, when
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id         text primary key,
  actor_id   uuid references auth.users(id) on delete set null,
  actor_name text,
  action     text not null,
  entity     text,
  record_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- backups — record of completed/attempted backups
-- ---------------------------------------------------------------------------
create table if not exists public.backups (
  id         text primary key,
  kind       text not null check (kind in ('FULL','EXPORT')),
  status     text not null check (status in ('SUCCESS','FAILED')),
  filename   text,
  size_bytes bigint,
  note       text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- attach id + updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['teachers','students','batches','class_schedules','classes','attendance','fee_records','payments','receipts','audit_logs','backups']
  loop
    execute format('create trigger tg_%s_id before insert on public.%I for each row execute function public.auto_id()', replace(t,'_',''), t);
    if t in ('teachers','students','batches','class_schedules','classes','fee_records','payments') then
      execute format('create trigger tg_%s_upd before update on public.%I for each row execute function public.set_updated_at()', replace(t,'_',''), t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Helper: institute-local "today" respecting the configured timezone
-- ---------------------------------------------------------------------------
create or replace function public.institute_today()
returns date language sql stable security definer set search_path = public as
$$ select (now() at time zone coalesce((select timezone from public.institute_profile where id='main'),'Asia/Kolkata'))::date $$;

-- ---------------------------------------------------------------------------
-- RPC: materialize classes for a date from active schedules
-- ---------------------------------------------------------------------------
create or replace function public.materialize_classes(p_date date default null)
returns setof public.classes
language plpgsql security definer set search_path = public
as $$
declare v_date date := coalesce(p_date, public.institute_today());
begin
  insert into public.classes (schedule_id, batch_id, teacher_id, class_date, start_time, end_time, room)
  select s.id, s.batch_id, s.teacher_id, v_date, s.start_time, s.end_time, s.room
  from public.class_schedules s
  where s.status = 'ACTIVE'
    and s.days @> array[(extract(ISODOW from v_date)::int % 7)::smallint]
    and exists (select 1 from public.batches b where b.id = s.batch_id and b.status = 'ACTIVE')
  on conflict (batch_id, class_date, start_time) do nothing;
  return query select c.* from public.classes c where c.class_date = v_date order by c.start_time;
end;
$$;

create or replace function public.get_today_classes()
returns setof public.classes
language sql security definer set search_path = public as
$$ select * from public.materialize_classes(null) $$;

create or replace function public.get_today_classes_for_teacher()
returns setof public.classes
language plpgsql security definer set search_path = public
as $$
declare v_tid text := public.current_teacher_id();
begin
  perform public.materialize_classes(null);
  return query select c.* from public.classes c
    where c.class_date = public.institute_today() and c.teacher_id = v_tid
    order by c.start_time;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: submit attendance (teacher). Prevents duplicates.
-- ---------------------------------------------------------------------------
create or replace function public.submit_attendance(p_class_id text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tid text := public.current_teacher_id();
  v_batch_id text;
  v_date date;
  v_row jsonb;
  v_sid text; v_status text;
  v_count int := 0;
begin
  if v_tid is null then
    return jsonb_build_object('ok', false, 'error', 'Not authorised as teacher.');
  end if;
  select batch_id, class_date into v_batch_id, v_date
    from public.classes where id = p_class_id and teacher_id = v_tid;
  if v_batch_id is null then
    return jsonb_build_object('ok', false, 'error', 'Class not found or not assigned to you.');
  end if;
  if exists (select 1 from public.classes where id = p_class_id and attendance_submitted) then
    return jsonb_build_object('ok', false, 'error', 'Attendance already submitted.');
  end if;
  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_sid := v_row->>'student_id';
    v_status := upper(coalesce(v_row->>'status','PRESENT'));
    if v_status not in ('PRESENT','ABSENT','LATE','LEAVE') then v_status := 'PRESENT'; end if;
    if exists (select 1 from public.batch_students where batch_id = v_batch_id and student_id = v_sid and status='ACTIVE') then
      insert into public.attendance (student_id, batch_id, teacher_id, class_id, attendance_date, attendance_status)
      values (v_sid, v_batch_id, v_tid, p_class_id, v_date, v_status)
      on conflict (student_id, class_id, attendance_date)
      do update set attendance_status = excluded.attendance_status;
      v_count := v_count + 1;
    end if;
  end loop;
  update public.classes set attendance_submitted = true, submitted_at = now() where id = p_class_id;
  insert into public.audit_logs (actor_id, actor_name, action, entity, record_id, detail)
  values (auth.uid(), (select name from public.teachers where id = v_tid), 'SUBMIT_ATTENDANCE', 'CLASS', p_class_id,
          jsonb_build_object('batch_id', v_batch_id, 'date', v_date, 'students', v_count));
  return jsonb_build_object('ok', true, 'inserted', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: correct attendance (admin only) — recorded in audit log
-- ---------------------------------------------------------------------------
create or replace function public.correct_attendance(p_attendance_id text, p_status text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v record;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  select * into v from public.attendance where id = p_attendance_id;
  if v.id is null then raise exception 'Attendance record not found'; end if;
  if p_status not in ('PRESENT','ABSENT','LATE','LEAVE') then raise exception 'Invalid status'; end if;
  update public.attendance set attendance_status = p_status, corrected_by = auth.uid(), corrected_at = now()
    where id = p_attendance_id;
  insert into public.audit_logs (actor_id, actor_name, action, entity, record_id, detail)
  values (auth.uid(), (select admin_name from public.admin_profile where id='main'), 'CORRECT_ATTENDANCE', 'ATTENDANCE', p_attendance_id,
          jsonb_build_object('from', v.attendance_status, 'to', p_status));
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: log audit entry (app-level)
-- ---------------------------------------------------------------------------
create or replace function public.log_audit(p_action text, p_entity text, p_record_id text, p_detail jsonb default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_actor_name text;
begin
  if public.is_admin() then
    select admin_name into v_actor_name from public.admin_profile where id='main';
  else
    select name into v_actor_name from public.teachers where id = public.current_teacher_id();
  end if;
  insert into public.audit_logs (actor_id, actor_name, action, entity, record_id, detail)
  values (auth.uid(), v_actor_name, p_action, p_entity, p_record_id, p_detail);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: record a payment + generate receipt + update fee record (admin only)
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_student_id text,
  p_fee_record_id text,
  p_payment_date date,
  p_amount numeric,
  p_method text,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_fee record;
  v_payment_id text;
  v_receipt_id text;
  v_receiver text;
  v_new_paid numeric;
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  select * into v_fee from public.fee_records where id = p_fee_record_id;
  if v_fee.id is null or v_fee.student_id <> p_student_id then
    raise exception 'Fee record not found for this student';
  end if;
  select admin_name into v_receiver from public.admin_profile where id='main';
  -- payment
  insert into public.payments (student_id, fee_record_id, payment_date, amount, method, note)
  values (p_student_id, p_fee_record_id, p_payment_date, p_amount, upper(p_method), p_note)
  returning id into v_payment_id;
  -- receipt (number = generated id)
  insert into public.receipts (receipt_number, payment_id, student_id, fee_record_id, receipt_date, amount, method, received_by, notes)
  values ('', v_payment_id, p_student_id, p_fee_record_id, p_payment_date, p_amount, upper(p_method), v_receiver, p_note)
  returning id into v_receipt_id;
  update public.receipts set receipt_number = v_receipt_id where id = v_receipt_id;
  -- fee record update
  v_new_paid := v_fee.paid_amount + p_amount;
  v_status := case when v_new_paid >= v_fee.amount then 'PAID'
                   when v_new_paid > 0 then 'PARTIAL'
                   else 'PENDING' end;
  update public.fee_records set paid_amount = v_new_paid, status = v_status, updated_at = now()
    where id = p_fee_record_id;
  insert into public.audit_logs (actor_id, actor_name, action, entity, record_id, detail)
  values (auth.uid(), v_receiver, 'RECORD_PAYMENT', 'PAYMENT', v_payment_id,
          jsonb_build_object('student_id', p_student_id, 'amount', p_amount, 'method', upper(p_method), 'receipt', v_receipt_id));
  return jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'receipt_id', v_receipt_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: recompute fee statuses (overdue etc.) — admin
-- ---------------------------------------------------------------------------
create or replace function public.recompute_fee_status()
returns int
language plpgsql security definer set search_path = public
as $$
declare v_today date := public.institute_today(); v_updated int;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update public.fee_records set status = case
      when paid_amount >= amount then 'PAID'
      when paid_amount > 0 then 'PARTIAL'
      when due_date is not null and due_date < v_today then 'OVERDUE'
      else 'PENDING' end,
    updated_at = now();
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: dashboard stats — returns counts/financials in one call
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_stats()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_today date := public.institute_today(); v_month_start date := date_trunc('month', v_today)::date;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  return jsonb_build_object(
    'students_total', (select count(*) from public.students where deleted_at is null),
    'teachers_active', (select count(*) from public.teachers where status='ACTIVE' and deleted_at is null),
    'batches_active', (select count(*) from public.batches where status='ACTIVE' and deleted_at is null),
    'classes_today', (select count(*) from public.classes where class_date = v_today),
    'attendance_submitted_today', (select count(*) from public.classes where class_date = v_today and attendance_submitted),
    'present_today', (select count(*) from public.attendance where attendance_date = v_today and attendance_status = 'PRESENT'),
    'late_today', (select count(*) from public.attendance where attendance_date = v_today and attendance_status = 'LATE'),
    'absent_today', (select count(*) from public.attendance where attendance_date = v_today and attendance_status in ('ABSENT','LEAVE')),
    'fees_collected_month', (select coalesce(sum(amount),0) from public.payments where date_trunc('month', payment_date) = date_trunc('month', v_today)),
    'fees_pending_month', (select coalesce(sum(amount - paid_amount),0) from public.fee_records where date_trunc('month', fee_month) = date_trunc('month', v_today)),
    'fees_overdue', (select coalesce(sum(amount - paid_amount),0) from public.fee_records where status='OVERDUE'),
    'overdue_count', (select count(*) from public.fee_records where status='OVERDUE')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- ENABLE ROW LEVEL SECURITY + POLICIES
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.institute_profile enable row level security;
alter table public.admin_profile enable row level security;
alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.batches enable row level security;
alter table public.teacher_batches enable row level security;
alter table public.batch_students enable row level security;
alter table public.class_schedules enable row level security;
alter table public.classes enable row level security;
alter table public.attendance enable row level security;
alter table public.fee_records enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;
alter table public.audit_logs enable row level security;
alter table public.backups enable row level security;

-- grant base privileges (Supabase grants these by default; kept explicit for portability)
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

-- expose id columns to anon/authenticated? no — only what policies allow.

-- institute_profile: public read (branding for login page), admin write
create policy inst_sel on public.institute_profile for select to anon, authenticated using (true);
create policy inst_admin on public.institute_profile for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- admin_profile: admin only
create policy adminp_sel on public.admin_profile for select to authenticated using (public.is_admin());
create policy adminp_admin on public.admin_profile for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- user_profiles: own row or admin
create policy up_sel on public.user_profiles for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy up_admin on public.user_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- teachers: self or admin
create policy t_sel on public.teachers for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy t_admin on public.teachers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- students: admin, or teacher with an enrolled batch
create policy s_sel on public.students for select to authenticated using (
  public.is_admin() or
  exists (select 1 from public.batch_students bs where bs.student_id = public.students.id and public.teacher_of_batch(bs.batch_id))
);
create policy s_admin on public.students for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- batches: admin or assigned teacher
create policy b_sel on public.batches for select to authenticated using (public.is_admin() or public.teacher_of_batch(id));
create policy b_admin on public.batches for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- teacher_batches: admin or own
create policy tbt_sel on public.teacher_batches for select to authenticated using (public.is_admin() or teacher_id = public.current_teacher_id());
create policy tbt_admin on public.teacher_batches for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- batch_students: admin or assigned teacher
create policy bst_sel on public.batch_students for select to authenticated using (public.is_admin() or public.teacher_of_batch(batch_id));
create policy bst_admin on public.batch_students for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- class_schedules
create policy cs_sel on public.class_schedules for select to authenticated using (public.is_admin() or public.teacher_of_batch(batch_id));
create policy cs_admin on public.class_schedules for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- classes
create policy cl_sel on public.classes for select to authenticated using (public.is_admin() or public.teacher_of_batch(batch_id));
create policy cl_admin on public.classes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- attendance: admin, or teacher of the batch (write via RPCs only)
create policy att_sel on public.attendance for select to authenticated using (public.is_admin() or public.teacher_of_batch(batch_id));
create policy att_admin on public.attendance for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- financial + system tables: admin only
create policy fee_admin on public.fee_records for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy pay_admin on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy rec_admin on public.receipts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy aud_sel on public.audit_logs for select to authenticated using (public.is_admin());
create policy aud_admin on public.audit_logs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy bak_admin on public.backups for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- grants for functions
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_teacher_id() to authenticated;
grant execute on function public.teacher_of_batch(text) to authenticated;
grant execute on function public.materialize_classes(date) to authenticated;
grant execute on function public.get_today_classes() to authenticated;
grant execute on function public.get_today_classes_for_teacher() to authenticated;
grant execute on function public.submit_attendance(text, jsonb) to authenticated;
grant execute on function public.correct_attendance(text, text) to authenticated;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;
grant execute on function public.record_payment(text, text, date, numeric, text, text) to authenticated;
grant execute on function public.recompute_fee_status() to authenticated;
grant execute on function public.get_dashboard_stats() to authenticated;