import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Phone, Mail, MapPin, CalendarDays, UserRound } from 'lucide-react'
import { fetchById, fetchBy, fetchAll } from '../../lib/api'
import type { Student, BatchStudent, Batch, Attendance, FeeRecord, Payment, Receipt, StudentAttendanceSummary } from '../../lib/types'
import { Card, Badge, PageLoader, useToast } from '../../components/ui'
import { formatDate, formatINR, statusStyle } from '../../lib/utils'

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const [student, setStudent] = useState<Student | null>(null)
  const [batches, setBatches] = useState<string[]>([])
  const [batchMap, setBatchMap] = useState<Record<string, string>>({})
  const [att, setAtt] = useState<Attendance[]>([])
  const [fees, setFees] = useState<FeeRecord[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [receiptMap, setReceiptMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const load = useCallback(async () => {
    if (!id) return
    try {
      const [s, bs, attRows, feeRows, payRows, allBatches, receipts] = await Promise.all([
        fetchById<Student>('students', id),
        fetchBy<BatchStudent>('batch_students', 'student_id', id),
        fetchBy<Attendance>('attendance', 'student_id', id, { order: 'attendance_date', ascending: false }),
        fetchBy<FeeRecord>('fee_records', 'student_id', id, { order: 'fee_month', ascending: false }),
        fetchBy<Payment>('payments', 'student_id', id, { order: 'payment_date', ascending: false }),
        fetchAll<Batch>('batches'),
        fetchBy<Receipt>('receipts', 'student_id', id),
      ])
      if (!s) {
        toast('Student not found', 'error')
        return
      }
      setStudent(s)
      setBatchMap(Object.fromEntries(allBatches.filter((b) => !b.deleted_at).map((b) => [b.id, b.name])))
      setBatches(
        bs
          .filter((m) => m.status === 'ACTIVE')
          .map((m) => allBatches.find((b) => b.id === m.batch_id)?.name ?? m.batch_id)
      )
      setAtt(attRows)
      setFees(feeRows)
      setPayments(payRows)
      setReceiptMap(Object.fromEntries(receipts.map((r) => [r.payment_id, r.id])))
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [id, toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !student) return <PageLoader />

  const summary: StudentAttendanceSummary = att.reduce(
    (acc, a) => {
      acc.total += 1
      acc[a.attendance_status.toLowerCase() as 'present' | 'absent' | 'late' | 'leave'] += 1
      return acc
    },
    { total: 0, present: 0, absent: 0, late: 0, leave: 0, percent: 0 }
  )
  summary.percent = summary.total ? Math.round((summary.present / summary.total) * 100) : 0

  const outstanding =
    fees.reduce((acc, f) => acc + (f.amount - f.paid_amount), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/app/students" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          <UserRound className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">{student.name}</h1>
          <p className="text-xs font-mono text-slate-500">{student.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-xs font-medium text-slate-500">Total Classes</p>
          <p className="text-xl font-bold text-slate-900">{summary.total}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500">Present</p>
          <p className="text-xl font-bold text-green-600">{summary.present}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500">Absent / Late</p>
          <p className="text-xl font-bold text-red-600">{summary.absent + summary.late}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-slate-500">Attendance %</p>
          <p className="text-xl font-bold text-brand-600">{summary.percent}%</p>
        </Card>
      </div>

      {/* Basic information */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Basic Information</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Info icon={<Phone className="h-4 w-4" />} label="Phone" value={student.phone ?? '—'} />
          <Info icon={<UserRound className="h-4 w-4" />} label="Parent / Guardian" value={student.parent_name ?? '—'} />
          <Info icon={<Phone className="h-4 w-4" />} label="Parent Phone" value={student.parent_phone ?? '—'} />
          <Info icon={<Mail className="h-4 w-4" />} label="Email" value={student.email ?? '—'} />
          <Info icon={<MapPin className="h-4 w-4" />} label="Address" value={student.address ?? '—'} />
          <Info icon={<CalendarDays className="h-4 w-4" />} label="Admission Date" value={formatDate(student.admission_date)} />
          <Info label="Course" value={student.course ?? '—'} />
          <Info label="Batches" value={batches.length ? batches.join(', ') : '—'} />
          <Info label="Monthly Fee" value={student.monthly_fee ? formatINR(student.monthly_fee) : '—'} />
          <Info label="Status" value={<Badge tone={student.status === 'ACTIVE' ? 'green' : student.status === 'INACTIVE' ? 'slate' : 'blue'}>{student.status}</Badge>} />
        </div>
      </Card>

      {/* Fee status */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Fee Status</h2>
        <p className="mb-2 text-sm text-slate-600">
          Outstanding balance: <span className="font-bold text-red-600">{formatINR(outstanding)}</span>
        </p>
        {fees.length === 0 ? (
          <p className="text-sm text-slate-400">No fee records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="th">Month</th>
                  <th className="th">Amount</th>
                  <th className="th">Paid</th>
                  <th className="th">Due Date</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b border-slate-50 last:border-0">
                    <td className="td">{formatDate(f.fee_month)}</td>
                    <td className="td">{formatINR(f.amount)}</td>
                    <td className="td">{formatINR(f.paid_amount)}</td>
                    <td className="td">{formatDate(f.due_date)}</td>
                    <td className="td"><Badge tone={statusTone(f.status)}>{f.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Payment history */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Payment History</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-400">No payments recorded.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{formatINR(p.amount)}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(p.payment_date)} · {p.method} · {formatDate(paymentMonth(p.fee_record_id, fees))}
                  </p>
                </div>
                <Link
                  to={receiptMap[p.id] ? `/app/receipts/${receiptMap[p.id]}` : `/app/students/${id}?pay=${p.id}`}
                  className="text-xs font-semibold text-brand-600 hover:underline"
                >
                  Receipt
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Attendance history */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Attendance History</h2>
        {att.length === 0 ? (
          <p className="text-sm text-slate-400">No attendance records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Status</th>
                  <th className="th">Batch</th>
                </tr>
              </thead>
              <tbody>
                {att.slice(0, 50).map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 last:border-0">
                    <td className="td">{formatDate(a.attendance_date)}</td>
                    <td className="td">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle(a.attendance_status)}`}>
                        {a.attendance_status}
                      </span>
                    </td>
                    <td className="td">{a.batch_id ? batchMap[a.batch_id] ?? a.batch_id : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function Info({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon ? <span className="mt-0.5 text-slate-400">{icon}</span> : null}
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm text-slate-800">{value}</p>
      </div>
    </div>
  )
}

function statusTone(s: string): string {
  return { PAID: 'green', PARTIAL: 'amber', PENDING: 'slate', OVERDUE: 'red' }[s] ?? 'slate'
}

function paymentMonth(feeId: string, fees: FeeRecord[]): string | null {
  return fees.find((f) => f.id === feeId)?.fee_month ?? null
}