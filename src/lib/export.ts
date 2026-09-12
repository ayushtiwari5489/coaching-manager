import JSZip from 'jszip'
import { fetchAll, fetchById, supabase, logAudit } from './api'
import type {
  TableName,
  BackupBundle,
  BackupRecord,
  InstituteProfile,
  AdminProfile,
} from './types'
import { toCSV, downloadBlob, todayISO, pick } from './utils'

const EXPORT_TABLE_ORDER: TableName[] = [
  'students',
  'teachers',
  'batches',
  'batch_students',
  'teacher_batches',
  'class_schedules',
  'classes',
  'attendance',
  'fee_records',
  'payments',
  'receipts',
  'audit_logs',
]

const EXCLUDE_COLS: Partial<Record<TableName, string[]>> = {
  // deleted_at kept on purpose (soft-delete history); nothing excluded currently.
}

export function exportColumns(table: TableName): string[] | undefined {
  return EXCLUDE_COLS[table]
}

export async function fetchTableRows(table: TableName) {
  const rows = await fetchAll<Record<string, unknown>>(table, { order: 'id' })
  if (EXCLUDE_COLS[table]) {
    const skip = new Set(EXCLUDE_COLS[table])
    return rows.map((r) => {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(r)) if (!skip.has(k)) out[k] = r[k]
      return out
    })
  }
  return rows
}

export async function exportTableCSV(table: TableName) {
  const rows = await fetchTableRows(table)
  return toCSV(rows)
}

export async function exportTableJSON(table: TableName) {
  const rows = await fetchTableRows(table)
  return JSON.stringify(rows, null, 2)
}

function downloadCSV(content: string, name: string) {
  downloadBlob(new Blob([content], { type: 'text/csv;charset=utf-8;' }), name)
}

function downloadJSON(content: string, name: string) {
  downloadBlob(new Blob([content], { type: 'application/json' }), name)
}

export async function doExport(table: TableName, format: 'csv' | 'json') {
  if (format === 'csv') {
    downloadCSV(await exportTableCSV(table), `${table}.csv`)
  } else {
    downloadJSON(await exportTableJSON(table), `${table}.json`)
  }
  await logAudit('EXPORT', table.toUpperCase(), null, { format })
}

export async function exportEverythingJSON() {
  const dump: Record<string, unknown> = {}
  for (const t of EXPORT_TABLE_ORDER) {
    dump[t] = await fetchTableRows(t)
  }
  const profile = await fetchById<InstituteProfile>('institute_profile', 'main')
  const admin = await fetchById<AdminProfile>('admin_profile', 'main')
  dump.institute_profile = profile ? [profile] : []
  dump.admin_profile = admin ? [admin] : []
  const json = JSON.stringify(dump, null, 2)
  downloadJSON(json, `coaching_export_${todayISO()}.json`)
  await logAudit('EXPORT', 'EVERYTHING', null, { format: 'json' })
}

const README_TEMPLATE = (profile: InstituteProfile | null, date: string) => `
COACHING MANAGER — COMPLETE DATA BACKUP
========================================
Backup created: ${date}
Institute: ${profile?.institute_name ?? ''}

This backup contains your complete coaching institute data in standard,
portable formats. Your data is yours. No proprietary formats are used.

FILES IN THIS BACKUP
--------------------
students.csv          All students. id = stable Student ID (STU-00001).
teachers.csv          All teachers. id = stable Teacher ID (TCH-00001).
batches.csv           All batches. id = stable Batch ID (BAT-00001).
batch_students.csv    Which students belong to which batch
                      (batch_id, student_id, status ACTIVE/REMOVED).
teacher_batches.csv   Which teachers are assigned to which batch
                      (teacher_id, batch_id).
class_schedules.csv   Recurring weekly schedule for batches.
                      days column: array of weekday numbers,
                      0=Sunday, 1=Monday, ... 6=Saturday.
classes.csv           Individual class instances (id CLS-00001,
                      class_date, start_time, end_time).
attendance.csv        Attendance records (id ATT-00001).
                      attendance_status values: PRESENT, ABSENT, LATE, LEAVE.
                      attendance_date format: YYYY-MM-DD.
fee_records.csv       Monthly fee records (id FEE-00001, fee_month = first
                      day of month, e.g. 2026-09-01).
                      status values: PAID, PARTIAL, PENDING, OVERDUE.
payments.csv          Payment history (id PAY-00001).
                      method values: CASH, UPI, BANK_TRANSFER, OTHER.
receipts.csv          Receipts (id REC-00001, receipt_number unique).
audit_logs.csv        Record of who did what and when.
institute_profile.json  Institute name, branding, contacts, address,
                      academic information (single row JSON).
admin_profile.json    Admin contact details (private).
database_schema.sql   Full PostgreSQL schema (tables, indexes, constraints,
                      RLS security, functions). Can be re-applied on any
                      PostgreSQL 14+ server.
README.txt            This file.

COMMON COLUMNS & RELATIONSHIPS
------------------------------
* id columns are stable and permanent. They are preserved on export/import.
* attendance.student_id -> students.id  (e.g. STU-00001)
* attendance.batch_id   -> batches.id   (e.g. BAT-00003)
* attendance.class_id   -> classes.id
* fee_records.student_id -> students.id
* payments.student_id   -> students.id, payments.fee_record_id -> fee_records.id
* receipts.payment_id   -> payments.id

DATE FORMAT
-----------
All dates are YYYY-MM-DD. Times are HH:MM:SS (24-hour). Timestamps are
ISO-8601 with timezone (UTC).

STUDENT / TEACHER / BATCH STATUSES
----------------------------------
students:  ACTIVE, INACTIVE, COMPLETED
teachers:  ACTIVE, INACTIVE
batches:   ACTIVE, INACTIVE

HOW TO IMPORT THIS DATA INTO ANOTHER DATABASE
---------------------------------------------
1. Create a new empty PostgreSQL database on any provider you choose
   (local PostgreSQL, RDS, your own server, another Supabase project...).
2. Apply database_schema.sql to create the tables.
3. Import the CSV files in this order (relationships require parents first):
   students -> teachers -> batches -> batch_students -> teacher_batches
   -> class_schedules -> classes -> attendance -> fee_records
   -> payments -> receipts -> audit_logs.
4. Restore institute_profile.json into the institute_profile table.

You are never locked in. Your data can move to any platform that can read
CSV or JSON — which is essentially all of them.
`

async function buildBackupZip(): Promise<BackupBundle> {
  const zip = new JSZip()
  for (const t of EXPORT_TABLE_ORDER) {
    zip.file(`${t}.csv`, await exportTableCSV(t))
  }
  const profile = await fetchById<InstituteProfile>('institute_profile', 'main')
  const admin = await fetchById<AdminProfile>('admin_profile', 'main')
  zip.file('institute_profile.json', JSON.stringify(profile ?? {}, null, 2))
  zip.file('admin_profile.json', JSON.stringify(admin ?? {}, null, 2))

  // embed the schema SQL (bundled at build time)
  const schema = (await import('../../database_schema.sql?raw')).default
  zip.file('database_schema.sql', schema)

  // logo if stored in Supabase storage
  if (profile?.logo_url) {
    try {
      const path = profile.logo_url.split('/').slice(-1)[0]
      const ext = path.split('.').pop() ?? 'png'
      const { data } = await supabase.storage.from('branding').download(path)
      if (data) zip.file(`logo.${ext}`, data)
    } catch {
      // logo download optional — never fail a backup for a logo
    }
  }

  zip.file('README.txt', README_TEMPLATE(profile, todayISO()))
  const blob = await zip.generateAsync({ type: 'blob' })
  return { filename: `coaching_backup_${todayISO()}.zip`, blob, sizeBytes: blob.size }
}

export async function buildBackup(): Promise<BackupBundle> {
  return buildBackupZip()
}

export async function doBackup() {
  const { filename, blob, sizeBytes } = await buildBackup()
  downloadBlob(blob, filename)
  const { error } = await supabase.from('backups').insert({
    kind: 'FULL',
    status: 'SUCCESS',
    filename,
    size_bytes: sizeBytes,
    note: 'Complete ZIP backup generated from this device.',
  })
  if (error) throw new Error(error.message)
  await logAudit('BACKUP', 'FULL', null, { filename, sizeBytes })
  return { filename, sizeBytes }
}

export async function fetchBackupHistory(): Promise<BackupRecord[]> {
  const { data, error } = await supabase
    .from('backups')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []) as BackupRecord[]
}

export async function fetchDatabaseSchema(): Promise<string> {
  const schema = (await import('../../database_schema.sql?raw')).default
  return schema
}

export async function downloadDatabaseSchema() {
  const schema = await fetchDatabaseSchema()
  downloadBlob(new Blob([schema], { type: 'text/plain;charset=utf-8' }), 'database_schema.sql')
  await logAudit('EXPORT', 'SCHEMA', null, {})
}

export const TABLE_LABELS: Record<TableName, string> = {
  students: 'Students',
  teachers: 'Teachers',
  batches: 'Batches',
  batch_students: 'Batch → Student enrolment',
  teacher_batches: 'Teacher → Batch assignment',
  class_schedules: 'Class schedules',
  classes: 'Classes',
  attendance: 'Attendance',
  fee_records: 'Fee records',
  payments: 'Payments',
  receipts: 'Receipts',
  audit_logs: 'Audit logs',
  institute_profile: 'Institute profile',
  admin_profile: 'Admin profile',
}

export { pick }