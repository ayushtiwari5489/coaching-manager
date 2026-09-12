export type Role = 'admin' | 'teacher'

export interface UserProfile {
  user_id: string
  role: Role
  teacher_id: string | null
  created_at: string
}

export interface InstituteProfile {
  id: string
  institute_name: string
  short_name: string
  tagline: string | null
  logo_url: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  address: string | null
  locality: string | null
  city: string | null
  state: string | null
  pincode: string | null
  courses: string | null
  classes: string | null
  academic_session: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export interface AdminProfile {
  id: string
  admin_name: string | null
  admin_phone: string | null
  admin_email: string | null
  updated_at: string
}

export interface Teacher {
  id: string
  name: string
  phone: string | null
  email: string | null
  subject: string | null
  status: 'ACTIVE' | 'INACTIVE'
  user_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'COMPLETED'

export interface Student {
  id: string
  name: string
  roll_no: string | null
  phone: string | null
  parent_name: string | null
  parent_phone: string | null
  email: string | null
  address: string | null
  course: string | null
  admission_date: string | null
  monthly_fee: number
  status: StudentStatus
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface Batch {
  id: string
  name: string
  subject: string | null
  days: number[]
  start_time: string | null
  end_time: string | null
  room: string | null
  status: 'ACTIVE' | 'INACTIVE'
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface BatchStudent {
  batch_id: string
  student_id: string
  status: 'ACTIVE' | 'REMOVED'
  joined_at: string
  left_at: string | null
}

export interface TeacherBatch {
  teacher_id: string
  batch_id: string
  assigned_at: string
}

export interface ClassSchedule {
  id: string
  batch_id: string
  teacher_id: string | null
  days: number[]
  start_time: string
  end_time: string
  room: string | null
  status: 'ACTIVE' | 'INACTIVE'
  created_at: string
  updated_at: string
}

export interface ClassItem {
  id: string
  schedule_id: string | null
  batch_id: string
  teacher_id: string | null
  class_date: string
  start_time: string | null
  end_time: string | null
  room: string | null
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
  attendance_submitted: boolean
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export type Class = ClassItem

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE'

export interface Attendance {
  id: string
  student_id: string
  batch_id: string | null
  teacher_id: string | null
  class_id: string | null
  attendance_date: string
  attendance_status: AttendanceStatus
  submitted_at: string
  corrected_by: string | null
  corrected_at: string | null
  created_at: string
}

export type FeeStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE'

export interface FeeRecord {
  id: string
  student_id: string
  fee_month: string
  amount: number
  due_date: string | null
  paid_amount: number
  status: FeeStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export type PaymentMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'OTHER'

export interface Payment {
  id: string
  student_id: string
  fee_record_id: string
  payment_date: string
  amount: number
  method: PaymentMethod
  note: string | null
  created_at: string
  updated_at: string
}

export interface Receipt {
  id: string
  receipt_number: string
  payment_id: string
  student_id: string
  fee_record_id: string | null
  receipt_date: string
  amount: number
  method: string | null
  received_by: string | null
  notes: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string | null
  actor_name: string | null
  action: string
  entity: string | null
  record_id: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export interface BackupRecord {
  id: string
  kind: 'FULL' | 'EXPORT'
  status: 'SUCCESS' | 'FAILED'
  filename: string | null
  size_bytes: number | null
  note: string | null
  created_by: string | null
  created_at: string
}

export type TableName =
  | 'students'
  | 'teachers'
  | 'batches'
  | 'batch_students'
  | 'teacher_batches'
  | 'class_schedules'
  | 'classes'
  | 'attendance'
  | 'fee_records'
  | 'payments'
  | 'receipts'
  | 'audit_logs'
  | 'institute_profile'
  | 'admin_profile'

export interface EnrichedClass extends ClassItem {
  batch_name?: string
  teacher_name?: string | null
  student_count?: number
}

export interface EnrichedStudent extends Student {
  batch_names?: string[]
  batch_ids?: string[]
}

export interface StudentAttendanceSummary {
  total: number
  present: number
  absent: number
  late: number
  leave: number
  percent: number
}

export interface DashStats {
  students_total: number
  teachers_active: number
  batches_active: number
  classes_today: number
  attendance_submitted_today: number
  present_today: number
  late_today: number
  absent_today: number
  fees_collected_month: number
  fees_pending_month: number
  fees_overdue: number
  overdue_count: number
}

export interface BackupBundle {
  filename: string
  blob: Blob
  sizeBytes: number
}

export interface ImportValidationError {
  row: number
  field: string
  message: string
}

export interface ImportResult {
  ok: boolean
  messages: string[]
  errors: ImportValidationError[]
}