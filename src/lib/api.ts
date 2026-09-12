import { supabase } from './supabase'
import type { TableName } from './types'
import { relError } from './utils'

export { supabase }

/**
 * Resolves the authenticated teacher's linked teacher row id, or null when the
 * account has no teacher row yet. Backed by the current_teacher_id() SQL helper.
 */
export async function currentTeacherId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('current_teacher_id')
  if (error) throw new Error(relError(error))
  return (data as string | null) ?? null
}

export async function fetchAll<T = Record<string, unknown>>(
  table: TableName,
  opts: { order?: string; ascending?: boolean; limit?: number } = {}
): Promise<T[]> {
  const limit = opts.limit ?? 1000
  let query = supabase.from(table).select('*').limit(limit)
  if (opts.order) query = query.order(opts.order, { ascending: opts.ascending ?? true })
  const { data, error } = await query
  if (error) throw new Error(relError(error))
  return (data ?? []) as T[]
}

export async function fetchById<T = Record<string, unknown>>(
  table: TableName,
  id: string
): Promise<T | null> {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(relError(error))
  return (data as T) ?? null
}

export async function fetchBy<T = Record<string, unknown>>(
  table: TableName,
  column: string,
  value: string | number | boolean,
  opts: { order?: string; ascending?: boolean } = {}
): Promise<T[]> {
  let query = supabase.from(table).select('*').eq(column, value)
  if (opts.order) query = query.order(opts.order, { ascending: opts.ascending ?? true })
  const { data, error } = await query
  if (error) throw new Error(relError(error))
  return (data ?? []) as T[]
}

export async function upsertRow<T = Record<string, unknown>>(
  table: TableName,
  rows: Record<string, unknown>[],
  onConflict = 'id'
): Promise<T[]> {
  const { data, error } = await supabase.from(table).upsert(rows, { onConflict }).select()
  if (error) throw new Error(relError(error))
  return (data ?? []) as T[]
}

export async function insertRow<T = Record<string, unknown>>(
  table: TableName,
  rows: Record<string, unknown>[]
): Promise<T[]> {
  const { data, error } = await supabase.from(table).insert(rows).select()
  if (error) throw new Error(relError(error))
  return (data ?? []) as T[]
}

export async function updateRow(
  table: TableName,
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from(table).update(patch).eq('id', id)
  if (error) throw new Error(relError(error))
}

export async function softDeleteStudent(id: string, status = 'INACTIVE') {
  const { error } = await supabase
    .from('students')
    .update({ status, deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(relError(error))
}

export async function fetchStudentsWithBatches() {
  const [students, memberships] = await Promise.all([
    fetchAll<import('./types').Student>('students', { order: 'name' }),
    fetchAll<import('./types').BatchStudent>('batch_students'),
  ])
  const byId = new Map<string, string[]>()
  for (const m of memberships) {
    if (m.status === 'ACTIVE') {
      const arr = byId.get(m.student_id) ?? []
      arr.push(m.batch_id)
      byId.set(m.student_id, arr)
    }
  }
  return students.map((s) => ({
    ...s,
    batch_ids: byId.get(s.id) ?? [],
  }))
}

export async function fetchTeachersWithBatches() {
  const [teachers, tb] = await Promise.all([
    fetchAll<import('./types').Teacher>('teachers', { order: 'name' }),
    fetchAll<import('./types').TeacherBatch>('teacher_batches'),
  ])
  const byId = new Map<string, string[]>()
  for (const r of tb) {
    const arr = byId.get(r.teacher_id) ?? []
    arr.push(r.batch_id)
    byId.set(r.teacher_id, arr)
  }
  return teachers.map((t) => ({
    ...t,
    batch_ids: byId.get(t.id) ?? [],
  }))
}

export async function fetchBatchesWithDetails() {
  const [batches, tb, bs] = await Promise.all([
    fetchAll<import('./types').Batch>('batches', { order: 'name' }),
    fetchAll<import('./types').TeacherBatch>('teacher_batches'),
    fetchAll<import('./types').BatchStudent>('batch_students'),
  ])
  const teacherIds = new Map<string, string[]>()
  const studentCounts = new Map<string, number>()
  for (const r of tb) {
    const arr = teacherIds.get(r.batch_id) ?? []
    arr.push(r.teacher_id)
    teacherIds.set(r.batch_id, arr)
  }
  for (const r of bs) {
    if (r.status === 'ACTIVE') studentCounts.set(r.batch_id, (studentCounts.get(r.batch_id) ?? 0) + 1)
  }
  return batches.map((b) => ({
    ...b,
    teacher_ids: teacherIds.get(b.id) ?? [],
    student_count: studentCounts.get(b.id) ?? 0,
  }))
}

export async function fetchDashboardStats() {
  const { data, error } = await supabase.rpc('get_dashboard_stats')
  if (error) throw new Error(relError(error))
  return data as import('./types').DashStats
}

export async function fetchTodayClassesAdmin() {
  const { data, error } = await supabase.rpc('get_today_classes')
  if (error) throw new Error(relError(error))
  return (data ?? []) as import('./types').ClassItem[]
}

export async function fetchTodayClassesTeacher() {
  const { data, error } = await supabase.rpc('get_today_classes_for_teacher')
  if (error) throw new Error(relError(error))
  return (data ?? []) as import('./types').ClassItem[]
}

export async function submitAttendance(classId: string, rows: { student_id: string; status: string }[]) {
  const { data, error } = await supabase.rpc('submit_attendance', {
    p_class_id: classId,
    p_rows: rows.map((r) => ({ student_id: r.student_id, status: r.status })),
  })
  if (error) throw new Error(relError(error))
  return data as { ok: boolean; error?: string; inserted?: number }
}

export async function correctAttendance(attendanceId: string, status: string) {
  const { data, error } = await supabase.rpc('correct_attendance', {
    p_attendance_id: attendanceId,
    p_status: status,
  })
  if (error) throw new Error(relError(error))
  return data as boolean
}

export async function recordPayment(args: {
  studentId: string
  feeRecordId: string
  paymentDate: string
  amount: number
  method: string
  note?: string
}) {
  const { data, error } = await supabase.rpc('record_payment', {
    p_student_id: args.studentId,
    p_fee_record_id: args.feeRecordId,
    p_payment_date: args.paymentDate,
    p_amount: args.amount,
    p_method: args.method,
    p_note: args.note ?? null,
  })
  if (error) throw new Error(relError(error))
  return data as { ok: boolean; payment_id?: string; receipt_id?: string; error?: string }
}

export async function recomputeFeeStatus() {
  const { data, error } = await supabase.rpc('recompute_fee_status')
  if (error) throw new Error(relError(error))
  return (data ?? 0) as number
}

export async function logAudit(
  action: string,
  entity: string,
  recordId: string | null,
  detail?: Record<string, unknown>
) {
  const { error } = await supabase.rpc('log_audit', {
    p_action: action,
    p_entity: entity,
    p_record_id: recordId,
    p_detail: detail ?? null,
  })
  if (error) console.warn('audit log failed', relError(error))
}