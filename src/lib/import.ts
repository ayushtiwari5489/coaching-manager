import Papa from 'papaparse'
import { supabase, logAudit } from './api'
import type { ImportValidationError, TableName } from './types'
import { relError, todayISO } from './utils'

export type ImportEntity =
  | 'students'
  | 'teachers'
  | 'batches'
  | 'attendance'
  | 'fee_records'
  | 'payments'
  | 'institute_profile'

export const IMPORT_ENTITIES: { value: ImportEntity; label: string }[] = [
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
  { value: 'batches', label: 'Batches' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'fee_records', label: 'Fee records' },
  { value: 'payments', label: 'Payments' },
  { value: 'institute_profile', label: 'Institute profile' },
]

export const FIELD_SYNONYMS: Record<ImportEntity, Record<string, string[]>> = {
  students: {
    id: ['id', 'student id', 'student_id', 'studentid', 'roll no', 'rollno'],
    name: ['name', 'student name', 'student_name', 'full name', 'fullname'],
    phone: ['phone', 'phone number', 'phone_no', 'mobile', 'mobile no', 'mobile_no'],
    parent_name: ['parent', 'parent name', 'parent_name', 'guardian', 'guardian name', 'father name', 'father_name'],
    parent_phone: ['parent phone', 'parent_phone', 'guardian phone', 'guardian_phone', 'parent mobile', 'parent_mobile'],
    email: ['email', 'email id', 'email_id', 'student email'],
    address: ['address', 'student address'],
    course: ['course', 'course name', 'subject'],
    admission_date: ['admission date', 'admission_date', 'joined date', 'joined_date', 'date of admission'],
    monthly_fee: ['monthly fee', 'monthly_fee', 'fee', 'fee amount', 'course fee'],
    status: ['status', 'student status'],
  },
  teachers: {
    id: ['id', 'teacher id', 'teacher_id'],
    name: ['name', 'teacher name', 'teacher_name', 'full name'],
    phone: ['phone', 'phone number', 'phone_no', 'mobile', 'mobile no'],
    email: ['email', 'email id', 'email_id'],
    subject: ['subject', 'subjects', 'teaching subject'],
    status: ['status', 'teacher status'],
  },
  batches: {
    id: ['id', 'batch id', 'batch_id'],
    name: ['name', 'batch name', 'batch_name', 'batch'],
    subject: ['subject', 'course', 'course name'],
    days: ['days', 'class days', 'schedule days'],
    start_time: ['start time', 'start_time', 'from', 'starts at'],
    end_time: ['end time', 'end_time', 'to', 'ends at'],
    room: ['room', 'room no', 'room number'],
    status: ['status', 'batch status'],
  },
  attendance: {
    student_id: ['student id', 'student_id', 'studentid'],
    batch_id: ['batch id', 'batch_id'],
    class_id: ['class id', 'class_id'],
    attendance_date: ['attendance date', 'attendance_date', 'date'],
    attendance_status: ['attendance status', 'attendance_status', 'status', 'present'],
  },
  fee_records: {
    student_id: ['student id', 'student_id'],
    fee_month: ['fee month', 'fee_month', 'month'],
    amount: ['amount', 'fee amount', 'monthly fee', 'monthly_fee'],
    due_date: ['due date', 'due_date', 'last date'],
    paid_amount: ['paid amount', 'paid_amount', 'paid'],
    status: ['status', 'fee status'],
    notes: ['notes', 'note', 'remarks'],
  },
  payments: {
    student_id: ['student id', 'student_id'],
    fee_record_id: ['fee record id', 'fee_record_id'],
    payment_date: ['payment date', 'payment_date', 'date'],
    amount: ['amount', 'paid amount', 'paid_amount'],
    method: ['method', 'payment method', 'payment_method', 'mode'],
    note: ['note', 'notes', 'remarks'],
  },
  institute_profile: {
    institute_name: ['institute name', 'institute_name', 'name'],
    short_name: ['short name', 'short_name'],
    tagline: ['tagline'],
    phone: ['phone', 'phone number'],
    whatsapp: ['whatsapp'],
    email: ['email'],
    website: ['website'],
    address: ['address'],
    locality: ['locality', 'area'],
    city: ['city'],
    state: ['state'],
    pincode: ['pincode', 'pin code'],
    courses: ['courses', 'subjects'],
    classes: ['classes', 'grades'],
    academic_session: ['academic session', 'academic_session', 'session'],
    timezone: ['timezone'],
  },
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function autoDetectEntity(keys: string[]): ImportEntity | null {
  const set = new Set(keys.map(normalizeKey))
  const has = (...syns: string[]) => syns.some((s) => set.has(normalizeKey(s)))
  if (has('fee month', 'fee_month', 'amount') && has('student id', 'student_id')) return 'fee_records'
  if (has('payment date', 'payment_date') && has('amount') && has('method', 'payment method')) return 'payments'
  if (has('attendance date', 'attendance_date', 'date') && has('student id', 'student_id')) return 'attendance'
  if (has('student name', 'student_name', 'name') && (has('parent', 'parent name') || has('monthly fee', 'monthly_fee'))) return 'students'
  if (has('teacher name', 'teacher_name', 'name') && has('subject')) return 'teachers'
  if (has('batch name', 'batch_name', 'name', 'batch')) return 'batches'
  if (has('institute name', 'institute_name')) return 'institute_profile'
  return null
}

export async function parseFile(file: File): Promise<{ format: 'csv' | 'json'; csvHeaders?: string[]; csvRows?: Record<string, string>[]; error?: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'json') {
    const text = await file.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return { format: 'json', error: 'Invalid JSON file.' }
    }
    // Accept either { tableName: [rows...] } or a bare array of rows
    let tables: Record<string, unknown[]> = {}
    if (Array.isArray(parsed)) {
      tables = { rows: parsed as unknown[] }
    } else if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') tables[k] = v as unknown[]
      }
      if (Object.keys(tables).length === 0) tables = { rows: Object.values(obj).filter((v) => v && typeof v === 'object') }
    }
    // Convert every table to the shared flat-row shape
    const flat: Record<string, string>[] = []
    const headers = new Set<string>()
    const preferredTable = Object.values(tables)[0] ?? []
    for (const r of preferredTable) {
      const row: Record<string, string> = {}
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
        const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
        row[k] = s
        headers.add(k)
      }
      flat.push(row)
    }
    return { format: 'json', csvHeaders: Array.from(headers), csvRows: flat }
  }
  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text()
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    if (result.errors.length && result.errors.length > (result.data.length ? 2 : 0)) {
      return { format: 'csv', error: 'Could not parse CSV file.' }
    }
    const rows = result.data.filter((r) => Object.values(r).some((v) => (v ?? '').trim() !== ''))
    return { format: 'csv', csvHeaders: result.meta.fields ?? [], csvRows: rows }
  }
  return { format: 'csv', error: 'Unsupported file type. Upload a .csv or .json file.' }
}

export function buildColumnMap(entity: ImportEntity, csvHeaders: string[]) {
  const map: Record<string, string> = {}
  const normHeaders = csvHeaders.map((h) => ({ raw: h, norm: normalizeKey(h) }))
  for (const [field, syns] of Object.entries(FIELD_SYNONYMS[entity] ?? {})) {
    const hit = normHeaders.find((h) => syns.includes(h.norm))
    if (hit) map[field] = hit.raw
  }
  return map
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined) return NaN
  const s = String(v).replace(/[₹,]/g, '').trim()
  if (s === '') return NaN
  const n = parseFloat(s)
  return isNaN(n) ? NaN : n
}

function parseDate(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s) return null
  // common formats: 2026-09-12, 12/09/2026, 12-09-2026, 12-Sep-2026
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const ms = s.match(/^(\d{1,2})[\s-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:[\/\-. ]|,)?\s*(\d{4})$/i)
  if (ms) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const mo = months.indexOf(ms[2].toLowerCase()) + 1
    return `${ms[3]}-${String(mo).padStart(2, '0')}-${ms[1].padStart(2, '0')}`
  }
  return null
}

function mapRow(entity: ImportEntity, row: Record<string, string>, map: Record<string, string>) {
  const get = (field: string): string | null => {
    const src = map[field]
    if (!src) return null
    const v = row[src] ?? ''
    return v.trim() === '' ? null : v.trim()
  }
  const rec: Record<string, unknown> = {}
  switch (entity) {
    case 'students':
      rec.id = get('id') ?? undefined
      rec.name = get('name') ?? null
      rec.phone = get('phone')
      rec.parent_name = get('parent_name')
      rec.parent_phone = get('parent_phone')
      rec.email = get('email')
      rec.address = get('address')
      rec.course = get('course')
      rec.admission_date = parseDate(get('admission_date'))
      rec.monthly_fee = parseNum(get('monthly_fee'))
      rec.status = (get('status') ?? 'ACTIVE').toUpperCase()
      break
    case 'teachers':
      rec.id = get('id') ?? undefined
      rec.name = get('name') ?? null
      rec.phone = get('phone')
      rec.email = get('email')
      rec.subject = get('subject')
      rec.status = (get('status') ?? 'ACTIVE').toUpperCase()
      break
    case 'batches':
      rec.id = get('id') ?? undefined
      rec.name = get('name') ?? null
      rec.subject = get('subject')
      rec.days = parseDays(get('days'))
      rec.start_time = normalizeTime(get('start_time'))
      rec.end_time = normalizeTime(get('end_time'))
      rec.room = get('room')
      rec.status = (get('status') ?? 'ACTIVE').toUpperCase()
      break
    case 'attendance':
      rec.student_id = get('student_id')
      rec.batch_id = get('batch_id') ?? undefined
      rec.class_id = get('class_id') ?? undefined
      rec.attendance_date = parseDate(get('attendance_date'))
      rec.attendance_status = (get('attendance_status') ?? 'PRESENT').toUpperCase()
      break
    case 'fee_records':
      rec.student_id = get('student_id')
      rec.fee_month = parseDate(get('fee_month'))
      rec.amount = parseNum(get('amount'))
      rec.due_date = parseDate(get('due_date'))
      rec.paid_amount = parseNum(get('paid_amount'))
      rec.status = (get('status') ?? 'PENDING').toUpperCase()
      rec.notes = get('notes')
      break
    case 'payments':
      rec.student_id = get('student_id')
      rec.fee_record_id = get('fee_record_id') ?? undefined
      rec.payment_date = parseDate(get('payment_date'))
      rec.amount = parseNum(get('amount'))
      rec.method = (get('method') ?? 'CASH').toUpperCase()
      rec.note = get('note')
      break
    case 'institute_profile':
      rec.institute_name = get('institute_name') ?? null
      rec.short_name = get('short_name') ?? null
      rec.tagline = get('tagline')
      rec.phone = get('phone')
      rec.whatsapp = get('whatsapp')
      rec.email = get('email')
      rec.website = get('website')
      rec.address = get('address')
      rec.locality = get('locality')
      rec.city = get('city')
      rec.state = get('state')
      rec.pincode = get('pincode')
      rec.courses = get('courses')
      rec.classes = get('classes')
      rec.academic_session = get('academic_session')
      break
  }
  return rec
}

function parseDays(v: string | null): number[] {
  if (!v) return []
  const parts = v.split(',').map((p) => p.trim())
  return parts
    .map((p) => {
      const n = parseInt(p, 10)
      if (n >= 0 && n <= 6) return n
      const names: Record<string, number> = {
        sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
      }
      return names[p.toLowerCase().slice(0, 3)]
    })
    .filter((n) => !isNaN(n) && n !== undefined)
}

function normalizeTime(v: string | null): string | null {
  if (!v) return null
  const s = v.trim()
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (m) {
    let h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    const sec = m[3] ? parseInt(m[3], 10) : 0
    const ampm = m[4]
    if (ampm) {
      if (ampm.toLowerCase() === 'pm' && h < 12) h += 12
      if (ampm.toLowerCase() === 'am' && h === 12) h = 0
    }
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return s.includes(':') ? s : null
}

const VALID = {
  attendance_status: ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'],
  student_status: ['ACTIVE', 'INACTIVE', 'COMPLETED'],
  simple_status: ['ACTIVE', 'INACTIVE'],
  fee_status: ['PAID', 'PARTIAL', 'PENDING', 'OVERDUE'],
  methods: ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'],
}

export function validateMapped(
  entity: ImportEntity,
  mapped: Record<string, unknown>[],
  existing: { tables: Partial<Record<string, Set<string>>> }
): { records: Record<string, unknown>[]; errors: ImportValidationError[] } {
  const errors: ImportValidationError[] = []
  const records: Record<string, unknown>[] = []

  mapped.forEach((r, i) => {
    const err = (field: string, message: string) => errors.push({ row: i + 2, field, message })

    switch (entity) {
      case 'students': {
        if (!r.name) err('name', 'Name is required')
        if (r.status && !VALID.student_status.includes(r.status as string)) {
          r.status = 'ACTIVE'
          err('status', `Invalid status "${r.status}" → set to ACTIVE`)
        }
        if (r.monthly_fee !== undefined && isNaN(r.monthly_fee as number)) {
          err('monthly_fee', 'Fee must be a number')
          r.monthly_fee = 0
        }
        break
      }
      case 'teachers':
        if (!r.name) err('name', 'Name is required')
        if (r.status && !VALID.simple_status.includes(r.status as string)) {
          r.status = 'ACTIVE'
        }
        if (r.email && existing.tables.teachers?.has((r.email as string).toLowerCase())) {
          err('email', 'Duplicate teacher email (already in database)')
        }
        break
      case 'batches':
        if (!r.name) err('name', 'Name is required')
        if (r.status && !VALID.simple_status.includes(r.status as string)) r.status = 'ACTIVE'
        if ((r.days as number[]).some((d) => d < 0 || d > 6)) err('days', 'Days must be 0–6 (0=Sunday)')
        break
      case 'attendance': {
        if (!r.student_id) err('student_id', 'student_id is required')
        if (!r.attendance_date) err('attendance_date', 'Date is required')
        const st = (r.attendance_status as string).toUpperCase()
        if (!VALID.attendance_status.includes(st)) {
          err('attendance_status', 'Status must be PRESENT/ABSENT/LATE/LEAVE')
        }
        r.attendance_status = st
        if (r.class_id && !existing.tables.classes?.has(r.class_id as string)) {
          err('class_id', `Class ${r.class_id} does not exist — import classes first`)
        }
        if (r.student_id && !existing.tables.students?.has(r.student_id as string)) {
          err('student_id', `Student ${r.student_id} does not exist — import students first`)
        }
        break
      }
      case 'fee_records': {
        if (!r.student_id) err('student_id', 'student_id is required')
        if (!r.fee_month) err('fee_month', 'Fee month is required (use YYYY-MM-01)')
        if (r.amount === undefined || isNaN(r.amount as number)) {
          err('amount', 'Amount must be a number')
        } else if ((r.amount as number) < 0) err('amount', 'Amount cannot be negative')
        const fs = (r.status as string).toUpperCase()
        if (!VALID.fee_status.includes(fs)) err('status', 'Invalid fee status')
        r.status = fs
        if (r.paid_amount === undefined || isNaN(r.paid_amount as number)) r.paid_amount = 0
        break
      }
      case 'payments': {
        if (!r.student_id) err('student_id', 'student_id is required')
        if (!r.payment_date) err('payment_date', 'Payment date is required')
        if (r.amount === undefined || isNaN(r.amount as number) || (r.amount as number) <= 0) {
          err('amount', 'Amount must be a positive number')
        }
        const pm = (r.method as string).toUpperCase()
        if (!VALID.methods.includes(pm)) err('method', 'Method must be CASH/UPI/BANK_TRANSFER/OTHER')
        r.method = pm
        if (r.student_id && !existing.tables.students?.has(r.student_id as string)) {
          err('student_id', `Student ${r.student_id} does not exist`)
        }
        if (r.fee_record_id && !existing.tables.fee_records?.has(r.fee_record_id as string)) {
          err('fee_record_id', `Fee record ${r.fee_record_id} does not exist — import fee records first`)
        }
        break
      }
      case 'institute_profile':
        break
    }
    records.push(r)
  })
  return { records, errors }
}

export async function loadExistingIds(): Promise<{ tables: Partial<Record<string, Set<string>>> }> {
  const tables: Partial<Record<string, Set<string>>> = {}
  const targets: TableName[] = ['students', 'teachers', 'batches', 'classes', 'fee_records']
  for (const t of targets) {
    const { data, error } = await supabase.from(t).select('id')
    if (!error && data) tables[t] = new Set((data as Array<{ id: string }>).map((r) => r.id))
  }
  return { tables }
}

export async function importRows(
  entity: ImportEntity,
  rows: Record<string, unknown>[]
): Promise<{ inserted: number; errors: string[]; messages: string[] }> {
  const errors: string[] = []
  const messages: string[] = []
  let inserted = 0

  const upsert = async (table: TableName, conflict: string, batch: Record<string, unknown>[]) => {
    for (let i = 0; i < batch.length; i += 100) {
      const chunk = batch.slice(i, i + 100)
      const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflict })
      if (error) errors.push(`row ${i + 1}+: ${relError(error)}`)
    }
  }

  const cleanRow = (r: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      if (v === undefined) continue
      if (v === null) { out[k] = null; continue }
      out[k] = v
    }
    return out
  }

  switch (entity) {
    case 'students':
      await upsert('students', 'id', rows.map(cleanRow))
      inserted = rows.length
      break
    case 'teachers':
      await upsert('teachers', 'id', rows.map(cleanRow))
      inserted = rows.length
      break
    case 'batches':
      await upsert('batches', 'id', rows.map(cleanRow))
      inserted = rows.length
      break
    case 'attendance': {
      // import with a generated id if not present; preserve stable ids
      await upsert(
        'attendance',
        'student_id,class_id,attendance_date',
        rows.map((r) => cleanRow(r))
      )
      inserted = rows.length
      break
    }
    case 'fee_records':
      await upsert('fee_records', 'id', rows.map(cleanRow))
      inserted = rows.length
      break
    case 'payments': {
      // payments require fee_record to exist (legacy platforms may not map)
      const paymentPrep = rows.map((r) => {
        if (r.fee_record_id) return { ...r, fee_record_id: r.fee_record_id }
        return r
      })
      let done = 0
      for (const row of paymentPrep) {
        const { error } = await supabase.from('payments').upsert(cleanRow(row), { onConflict: 'id' })
        if (error) {
          // fallback: create if fee_record_id missing but student exists
          errors.push(relError(error))
        } else {
          done += 1
        }
      }
      inserted = done
      break
    }
    case 'institute_profile': {
      const row = rows[0]
      if (row) {
        const readable: Record<string, unknown> = { id: 'main' }
        for (const k of Object.keys(row)) if (row[k] !== null && row[k] !== undefined) readable[k] = row[k]
        const { error } = await supabase.from('institute_profile').upsert(readable, { onConflict: 'id' })
        if (error) errors.push(relError(error))
        else inserted = 1
      }
      break
    }
  }

  await logAudit('IMPORT', entity.toUpperCase(), null, { rows: inserted })
  messages.push(`Imported ${inserted} ${entity.replace('_', ' ')} record${inserted === 1 ? '' : 's'}.`)
  return { inserted, errors, messages }
}

export { mapRow, todayISO }