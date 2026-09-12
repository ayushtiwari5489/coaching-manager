import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Pencil } from 'lucide-react'
import {
  fetchAll,
  fetchBy,
  correctAttendance,
  fetchTodayClassesAdmin,
  logAudit,
} from '../../lib/api'
import type { Attendance, Batch, Teacher, Student, ClassItem, AttendanceStatus } from '../../lib/types'
import {
  Button,
  Card,
  Input,
  Select,
  Modal,
  Badge,
  Table,
  Th,
  Td,
  PageLoader,
  EmptyState,
  useToast,
} from '../../components/ui'
import { formatDate, formatDateTime, statusStyle, todayISO, relError } from '../../lib/utils'

const ALL_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE']

export default function AdminAttendance() {
  const [date, setDate] = useState(todayISO())
  const [batchFilter, setBatchFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [classesByBatch, setClassesByBatch] = useState<ClassItem[]>([])
  const [filteredAtt, setFilteredAtt] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Attendance | null>(null)
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('PRESENT')
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [b, t, s, cls, todayCls] = await Promise.all([
        fetchAll<Batch>('batches'),
        fetchAll<Teacher>('teachers'),
        fetchAll<Student>('students'),
        fetchAll<Attendance>('attendance', { order: 'attendance_date', ascending: false }),
        fetchTodayClassesAdmin(),
      ])
      setBatches(b)
      setTeachers(t)
      setStudents(s)
      setAttendance(cls)
      setClasses(todayCls)
      setClassesByBatch(todayCls)
      const filtered = cls.filter((a) => a.attendance_date === todayISO())
      setFilteredAtt(filtered)
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let filtered = attendance.filter((a) => a.attendance_date === date)
    if (batchFilter !== 'ALL') filtered = filtered.filter((a) => a.batch_id === batchFilter)
    if (statusFilter !== 'ALL') filtered = filtered.filter((a) => a.attendance_status === statusFilter)
    setFilteredAtt(filtered)
  }, [date, batchFilter, statusFilter, attendance])

  const bMap = new Map(batches.map((b) => [b.id, b.name]))
  const tMap = new Map(teachers.map((t) => [t.id, t.name]))
  const sMap = new Map(students.map((s) => [s.id, s.name]))

  const doCorrect = async () => {
    if (!editing) return
    try {
      await correctAttendance(editing.id, newStatus)
      await logAudit('CORRECT_ATTENDANCE', 'ATTENDANCE', editing.id, { to: newStatus })
      toast('Attendance corrected.')
      setEditing(null)
      await load()
    } catch (e) {
      toast(relError(e), 'error')
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Attendance</h1>
        <p className="text-sm text-slate-500">View, filter and correct attendance. All corrections are logged.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
          <option value="ALL">All batches</option>
          {batches.filter((x) => !x.deleted_at).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Button variant="secondary" onClick={() => { setDate(todayISO()); setBatchFilter('ALL'); setStatusFilter('ALL') }}>Reset</Button>
      </div>

      {/* Per-class summary for the selected date */}
      <Card>
        <h2 className="mb-2 text-base font-semibold text-slate-900">Classes on {formatDate(date)}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {classes.filter((c) => c.class_date === date).length === 0 ? (
            <p className="col-span-full text-sm text-slate-400">No classes scheduled for this date.</p>
          ) : (
            classes.filter((c) => c.class_date === date).map((c) => {
              const rows = attendance.filter((a) => a.class_id === c.id)
              const present = rows.filter((r) => r.attendance_status === 'PRESENT').length
              return (
                <div key={c.id} className="rounded-lg border border-slate-100 p-3">
                  <p className="text-sm font-semibold text-slate-800">{bMap.get(c.batch_id) ?? c.batch_id}</p>
                  <p className="text-xs text-slate-500">{tMap.get(c.teacher_id ?? '') ?? '—'}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <Badge tone={c.attendance_submitted ? 'green' : 'amber'}>
                      {c.attendance_submitted ? `${present} present` : 'Pending'}
                    </Badge>
                    <span className="text-xs text-slate-400">{rows.length} marked</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      <Card className="!p-0">
        {filteredAtt.length === 0 ? (
          <EmptyState title="No attendance records" hint="Attendance appears here once teachers submit it." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <Th>Date</Th>
                  <Th>Student</Th>
                  <Th>Batch</Th>
                  <Th>Teacher</Th>
                  <Th>Status</Th>
                  <Th>Submitted</Th>
                  <Th className="!text-right">Correct</Th>
                </tr>
              </thead>
              <tbody>
                {filteredAtt.slice(0, 200).map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <Td>{formatDate(a.attendance_date)}</Td>
                    <Td className="font-medium">{sMap.get(a.student_id) ?? a.student_id}</Td>
                    <Td>{a.batch_id ? bMap.get(a.batch_id) ?? a.batch_id : '—'}</Td>
                    <Td>{a.teacher_id ? tMap.get(a.teacher_id) ?? '' : '—'}</Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle(a.attendance_status)}`}>
                        {a.attendance_status}
                      </span>
                    </Td>
                    <Td className="text-xs text-slate-400">
                      {formatDateTime(a.submitted_at)}
                      {a.corrected_at ? <div className="text-amber-600">corrected {formatDateTime(a.corrected_at)}</div> : null}
                    </Td>
                    <Td className="!text-right">
                      <Button variant="ghost" className="!px-2" onClick={() => { setEditing(a); setNewStatus(a.attendance_status) }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`Correct attendance — ${editing ? sMap.get(editing.student_id) ?? '' : ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={doCorrect}>Save correction</Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setNewStatus(s)}
              className={
                newStatus === s
                  ? 'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white'
                  : 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600'
              }
            >
              {s}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          The previous status and the correction will be recorded in the audit log.
        </p>
      </Modal>
    </div>
  )
}