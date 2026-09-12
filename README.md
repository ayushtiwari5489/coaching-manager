# Coaching Manager

A private, single-institute management app for one Owner/Admin and their teachers.
Built with React + TypeScript + Tailwind on the frontend and Supabase (PostgreSQL + Auth)
as the backend. Designed to run for **one institute only** — no public registration,
no multi-tenant features.

## What it does

- Students, Teachers and Batches (with weekly class schedules that auto-create daily classes)
- Attendance — Admin marks any class; each Teacher marks only their own batches (mobile-first,
  with offline queueing when the phone has no signal)
- Fees — monthly fee records, payments, receipts, overdue tracking
- Reports — attendance, fees, dues, backups
- Branding — institute logo and name shown on login, reports, receipts (editable in Settings)
- Export / Import / Backup — CSV + JSON per table, full ZIP backup, off-machine scripted backups,
  import with column mapping and validation
- Only two roles: `admin` (everything) and `teacher` (own batches, classes, attendance only)

### Two apps in one

| Area | Path | Notes |
|---|---|---|
| Admin | `/app/...` | Desktop-first, sidebar navigation |
| Teacher | `/teacher/...` | Mobile-first, bottom navigation, one-tap attendance |

## Tech stack

- React 18, React Router 6, TypeScript 5 (strict), Vite 5, Tailwind CSS 3
- Supabase: PostgreSQL schema + RLS + Auth, `@supabase/supabase-js`
- PWA via `vite-plugin-pwa` (installable, offline shell)
- JSZip, PapaParse, Lucide icons

## Getting started

1. **Install**
   ```bash
   npm install
   ```

2. **Create a Supabase project** at https://supabase.com and note the project URL and keys.

3. **Apply the database schema.** Run the SQL in `supabase/migrations/0001_init.sql`
   (and `0002_storage.sql`, `0003_roll_no.sql`) in your project's **SQL Editor**.
   `database_schema.sql` in the repo root is a copy of `0001_init.sql` for convenient use.

4. **Configure environment.** Copy `.env.example` to `.env` and fill in:
   ```bash
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # scripts ONLY, never shipped
   ADMIN_EMAIL=admin@yourinstitute.example
   ADMIN_PASSWORD=a-strong-password
   ADMIN_NAME=Institute Owner
   ```

5. **Create the Admin login** (service role, ignores RLS):
   ```bash
   npm run create-admin
   ```
   This creates the auth user, sets `user_profiles.role = admin`, and writes the admin profile row.

6. **Teacher logins** are created **in the app** (Teachers → Create login), no terminal needed.
   This requires one database function, applied in the SQL editor:
   ```
   supabase/migrations/0004_create_teacher_login.sql
   ```
   The function runs as the DB owner but only serves the signed-in Admin (`is_admin()`),
   so the service-role key never touches the browser. A CLI fallback (`npm run create-login`)
   still exists for the rare offline case.

7. **Run locally** — `npm run dev`, or build and host `dist/` anywhere (Netlify, Vercel,
   any static hosting, or a subfolder of your own domain).

## Security model (do not lose this)

- No "Create Account" page. The Admin creates teacher logins in-app (backed by an
  admin-only `create_teacher_login` database function); `create-admin`/`create-login` scripts
  are the offline fallback.
- Every table uses **Row Level Security**. A teacher querying the API directly cannot read
  other teachers' batches, or any fee/payment/student-phone data beyond their own batch
  attendance scope.
- Check `Settings → Security` in the app for the full list.
- The `.env` file and `SUPABASE_SERVICE_ROLE_KEY` must **never** be committed or exposed.

## Backups (off-machine, scripted)

```bash
npm run backup                       # writes backups/institute-backup-<timestamp>/
```
Includes `data.json` (every table in dependency order) + `schema.sql` + branding logo.
In-app you can also export CSV/JSON per table and download a full ZIP backup from **Data Center**.
Keep backups on a separate device. `RECOVERY_GUIDE.md` walks through a full restore.

## Development scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run preview` | Preview the built app |
| `npm run create-admin` | Create/reset the admin login (reads `.env`; fallback only) |
| `npm run create-login` | Create a teacher login via CLI (reads `.env`; fallback only) |
| `npm run backup` | Full off-machine JSON backup (reads `.env`) |

## Project structure

```
src/
  lib/        supabase client, api helpers, types, auth, profile, utils,
              offline queue, export (CSV/JSON/ZIP), import (map/validate/import)
  components/ ui primitives, branding (logo/name), layouts (admin + teacher)
  pages/
    admin/    Dashboard, Students, StudentDetail, Teachers, Batches, Attendance,
              Fees, ReceiptView, Reports, DataCenter, ImportPanel, Settings
    teacher/  Home, Classes, Attendance, Profile
  App.tsx     routes + role guards (RequireAdmin / RequireTeacher)
supabase/
  migrations/ 0001_init.sql · 0002_storage.sql · 0003_roll_no.sql
scripts/      create-admin.mjs · create-login.mjs · backup.mjs
```

## Placeholders

Institute branding defaults to `[YOUR INSTITUTE NAME]`, `[SHORT NAME]`, etc. until you set
the real values in **Settings → Institute Profile & Branding**. Until then the app prints
those placeholders on login, receipts and reports.

## Editing the database

Migrations live in `supabase/migrations/`. With the Supabase CLI you can push them with
`npm run db:migrate`; without the CLI, paste the file contents into the SQL Editor.
Always export/backup before structural changes.