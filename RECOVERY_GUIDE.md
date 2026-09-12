# Recovery Guide

This guide explains what to do when something goes wrong, in order of severity. Everything
here works without the app's UI — you only need your Supabase dashboard and a browser.

---

## 0. Golden rules

1. **Backups are your only protection.** If you do nothing else, run `npm run backup`
   regularly and keep the folders on a different device.
2. **The anon key is public; the service role key is private.** A leaked service role key
   is the same as full database access — rotate it immediately in the Supabase dashboard if
   you ever suspect a leak.
3. **Never edit `database_schema.sql` by hand.** It is a copy of `supabase/migrations/0001_init.sql`.
4. **The Admin account is the only account that can create logins.** Losing it only means
   re-running `npm run create-admin` (it is not "locked out" forever).

---

## 1. I lost my Admin password

You can re-create/reset it with the service role — no way around needing the service role key:

```bash
npm run create-admin
```

This resets the password in `.env` (`ADMIN_PASSWORD`) and ensures the `admin` role,
`user_profiles` link and `admin_profile` row exist. Nothing else changes.

## 2. A teacher can't log in

- Did they get the right email/password? Run `npm run create-login -- --email <email> --password <new>` to reset it.
- Is their login linked to a Teacher row? Check `teachers.user_id` is null or set wrongly;
  rerun with `--teacher-id`. Without a link, the teacher sees no batches.
- If they can log in but see no classes: they have no `teacher_batches` assignment. Assign
  them in **Batches → Manage Teachers** (or re-run with `--teacher-id`).

## 3. Someone's data looks wrong (a student missing, an attendance mismatch)

Checks before restoring from a backup:

1. **Students/batches** — look for `deleted_at` / `status = 'INACTIVE'`. The app soft-deletes;
   the row is still in the database. Invisible in most lists.
2. **Attendance never appeared** — suspect offline queue: the teacher's phone was offline and
   the records were queued. Open the teacher app → Profile → "Sync now".
3. **A single attendance record is wrong** — Admin Attendance → edit the date → correction also
   updates the student's monthly report.
4. **Fees month missing** — use **Fees → Generate for Month** rather than hand-editing.

## 4. I accidentally deleted the Admin account (or ALL admin access)

1. Get the service role key from Supabase **Dashboard → Settings → API keys**.
2. Put it (and the URL) into `.env`.
3. Run `npm run create-admin`. Your admin login is back, with full access.

## 5. Restoring from an off-machine backup (full disaster / new machine)

Applies when the database itself is gone (project deleted, tables dropped).

1. Create a fresh Supabase project (or open the SQL editor of a working one).
2. Run the schema: open `supabase/migrations/0001_init.sql`, `0002_storage.sql`,
   `0003_roll_no.sql` (or the `schema.sql` inside your backup folder) in the **SQL Editor**
   and run them in order. Verify the last command completed without errors.
3. Sign in as admin (recreate first with `npm run create-admin` if needed).
4. Go to **Data Center → Import**, choose the `data.json` file from your backup folder and
   import. Because the app preserves stable IDs (`STU-…`, `BAT-…`, `TCH-…`), relationships
   come back exactly as they were.
5. Re-upload the branding logo in **Settings → Institute Profile & Branding** if the backup
   contained it (restored base64 logo is applied automatically if present in `data.json`).
6. Create teacher logins again with `npm run create-login` (auth users are not stored in the
   data tables, for security).

On Supabase, an even better option: **Dashboard → Database → Backups** can restore a "point in
time" for your existing project — use that first if it's an operator error, and treat data.json
imports as the fallback.

## 6. The app shows "Incorlan" branding everywhere

You forgot to set the institute name. **Settings → Institute Profile & Branding → Save Changes**.
Every placeholder (`[YOUR INSTITUTE NAME]`, `[SHORT NAME]`, …) is replaced immediately.

## 7. I want to start over completely (fresh demo)

1. Delete all rows: in the SQL Editor run
   ```sql
   truncate public.batch_students, public.teacher_batches, public.classes,
            public.attendance, public.fee_records, public.payments, public.receipts,
            public.audit_logs, public.students, public.teachers, public.batches,
            public.class_schedules restart identity cascade;
   ```
2. Reset IDs if needed: `alter sequence public.seq_stu restart 1;` (repeat for `seq_tch`, `seq_bat`, …).
3. The auth users and `user_profiles` rows are **not** deleted by the truncate — remove logins
   you don't want from **Authentication → Users**.

## 8. I need to check the audit trail

The app logs every create/update/delete/import in `audit_logs` (`who, what, on what, when,
detail`). In the app: **Reports → Audit Log**. To query directly, use the SQL editor:
```sql
select action, entity, record_id, actor_name, created_at
from public.audit_logs order by created_at desc limit 100;
```

## 9. Structural changes (new column, new table)

1. `npm run backup` first.
2. Write a new numbered migration in `supabase/migrations/00XX_*.sql`.
3. Apply via `npm run db:migrate` (if using the Supabase CLI) or paste into the SQL Editor.
4. Run `npm run backup` again and store the new folder.

---

## Contact / notes for whoever takes over

- Admin and teacher **logins live in Supabase Auth**, not in the data JSON. Recreating logins
  after a restore is expected and safe.
- `receipts.receipt_number` is globally unique and never reused.
- Teacher scope is enforced in the *database* (RLS), not by hiding buttons — do not "open up"
  policies to fix a UI problem.
- The 3 migration files are the source of truth for the database. Keep them in version control.