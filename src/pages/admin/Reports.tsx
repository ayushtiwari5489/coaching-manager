import { useCallback, useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { fetchAll } from '../../lib/api'
import type { Attendance, FeeRecord, Payment, Student, Batch, Teacher, BatchStudent } from '../../lib/types'
import { Card, Button, PageLoader, useToast } from '../../components/ui'
import { useProfile } from '../../lib/profile'
import { InstituteLogo } from '../../components/branding'
import { formatDate, formatINR, monthLabel, todayISO, relError } from '../../lib/utils'

type Tab = 'att_daily' | 'att_weekly' | 'att_monthly' | 'att_student' | 'att_batch' | 'att_teacher' | 'fee_daily' | 'fee_monthly' | 'fee_pending' | 'fee_overdue' | 'fee_batch'

const TABS: { id: Tab; label: string; group: 'attendance' | 'fees' }[] = [
  { id: 'att_daily', label: 'Attendance · Daily', group: 'attendance' },
  { id: 'att_weekly', label: 'Attendance · Weekly', group: 'attendance' },
  { id: 'att_monthly', label: 'Attendance · Monthly', group: 'attendance' },
  { id: 'att_student', label: 'Attendance · Student-wise', group: 'attendance' },
  { id: 'att_batch', label: 'Attendance · Batch-wise', group: 'attendance' },
  { id: 'att_teacher', label: 'Attendance · Teacher-wise', group: 'attendance' },
  { id: 'fee_daily', label: 'Fees · Daily collection', group: 'fees' },
  { id: 'fee_monthly', label: 'Fees · Monthly collection', group: 'fees' },
  { id: 'fee_pending', label: 'Fees · Pending', group: 'fees' },
  { id: 'fee_overdue', label: 'Fees · Overdue', group: 'fees' },
  { id: 'fee_batch', label: 'Fees · By batch', group: 'fees' },
]

interface Row {
  label: string
  sub?: string
  values: Record<string, string | number>
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>('att_daily')
  const [att, setAtt] = useState<Attendance[]>([])
  const [fees, setFees] = useState<FeeRecord[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [memberships, setMemberships] = useState<BatchStudent[]>([])
  const [loading, setLoading] = useState(true)
  const { profile } = useProfile()
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [a, f, p, s, b, t, m] = await Promise.all([
        fetchAll<Attendance>('attendance'),
        fetchAll<FeeRecord>('fee_records'),
        fetchAll<Payment>('payments'),
        fetchAll<Student>('students'),
        fetchAll<Batch>('batches'),
        fetchAll<Teacher>('teachers'),
        fetchAll<BatchStudent>('batch_students'),
      ])
      setAtt(a)
      setFees(f)
      setPayments(p)
      setStudents(s)
      setBatches(b)
      setTeachers(t)
      setMemberships(m)
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <PageLoader />

  const sMap = new Map(students.map((s) => [s.id, s.name]))
  const bMap = new Map(batches.filter((x) => !x.deleted_at).map((b) => [b.id, b.name]))
  const tMap = new Map(teachers.map((t) => [t.id, t.name]))
  const batchOfStudent = (sid: string) => {
    const bid = memberships.find((m) => m.student_id === sid && m.status === 'ACTIVE')?.batch_id
    return bid ? (bMap.get(bid) ?? '') : ''
  }

  let rows: Row[] = []
  let columns: string[] = []

  const groupSum = <T,>(items: T[], keyFn: (x: T) => string, sel: (x: T) => number) => {
    const map = new Map<string, { n: number; sum: number }>()
    for (const it of items) {
      const k = keyFn(it)
      const cur = map.get(k) ?? { n: 0, sum: 0 }
      cur.n += 1
      cur.sum += sel(it)
      map.set(k, cur)
    }
    return map
  }

  switch (tab) {
    case 'att_daily': {
      const map = groupSum(att, (a) => a.attendance_date, (a) => (a.attendance_status === 'PRESENT' ? 1 : 0))
      const dates = Array.from(map.keys()).sort().reverse().slice(0, 15)
      columns = ['Days', 'Present %']
      rows = dates.map((d) => {
        const v = map.get(d)!
        return { label: formatDate(d), values: { Days: v.n, 'Present %': Math.round((v.sum / v.n) * 100) + '%' } }
      })
      break
    }
    case 'att_weekly': {
      const start = new Date(todayISO() + 'T00:00:00')
      start.setDate(start.getDate() - 6)
      columns = ['Marked', 'Present', 'Absent']
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start)
        d.setDate(start.getDate() + i)
        return d.toISOString().slice(0, 10)
      })
      rows = days
        .map((d) => {
          const day = att.filter((a) => a.attendance_date === d)
          const present = day.filter((a) => a.attendance_status === 'PRESENT').length
          return {
            label: formatDate(d),
            values: { Marked: day.length, Present: present, Absent: day.length - present },
          }
        })
        .reverse()
      break
    }
    case 'att_monthly': {
      const map = groupSum(att, (a) => a.attendance_date.slice(0, 7), (a) => (a.attendance_status === 'PRESENT' ? 1 : 0))
      columns = ['Records', 'Present %']
      rows = Array.from(map.keys())
        .sort()
        .reverse()
        .map((m) => {
          const v = map.get(m)!
          return { label: monthLabel(m + '-01'), values: { Records: v.n, 'Present %': Math.round((v.sum / v.n) * 100) + '%' } }
        })
      break
    }
    case 'att_student': {
      const map = groupSum(att, (a) => a.student_id, (a) => (a.attendance_status === 'PRESENT' ? 1 : 0))
      columns = ['Student', 'ID', 'Classes', 'Present', 'Absent', '%']
      rows = Array.from(map.entries())
        .map(([sid, v]) => ({
          label: sMap.get(sid) ?? sid,
          sub: sid,
          values: { ID: sid, Classes: v.n, Present: v.sum, Absent: v.n - v.sum, '%': Math.round((v.sum / v.n) * 100) + '%' },
        }))
        .sort((a, b) => (a.values['%'] as string).localeCompare(b.values['%'] as string))
        .reverse()
      break
    }
    case 'att_batch': {
      const map = new Map<string, { n: number; p: number }>()
      for (const a of att) {
        const bid = a.batch_id ?? 'NONE'
        const cur = map.get(bid) ?? { n: 0, p: 0 }
        cur.n += 1
        if (a.attendance_status === 'PRESENT') cur.p += 1
        map.set(bid, cur)
      }
      columns = ['Records', 'Present', '%']
      rows = Array.from(map.entries()).map(([bid, v]) => ({
        label: bMap.get(bid) ?? bid,
        values: { Records: v.n, Present: v.p, '%': Math.round((v.p / v.n) * 100) + '%' },
      }))
      break
    }
    case 'att_teacher': {
      const map = new Map<string, { n: number; p: number }>()
      for (const a of att) {
        const tid = a.teacher_id ?? 'NONE'
        const cur = map.get(tid) ?? { n: 0, p: 0 }
        cur.n += 1
        if (a.attendance_status === 'PRESENT') cur.p += 1
        map.set(tid, cur)
      }
      columns = ['Records', 'Present', '%']
      rows = Array.from(map.entries()).map(([tid, v]) => ({
        label: tMap.get(tid) ?? tid,
        values: { Records: v.n, Present: v.p, '%': Math.round((v.p / v.n) * 100) + '%' },
      }))
      break
    }
    case 'fee_daily': {
      const map = groupSum(payments, (p) => p.payment_date, (p) => p.amount)
      columns = ['Payments', 'Collected']
      rows = Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 30)
        .map(([d, v]) => ({ label: formatDate(d), values: { Payments: v.n, Collected: formatINR(v.sum) } }))
      break
    }
    case 'fee_monthly': {
      const map = groupSum(payments, (p) => p.payment_date.slice(0, 7), (p) => p.amount)
      columns = ['Payments', 'Collected']
      rows = Array.from(map.keys())
        .sort()
        .reverse()
        .map((m) => {
          const v = map.get(m)!
          return { label: monthLabel(m + '-01'), values: { Payments: v.n, Collected: formatINR(v.sum) } }
        })
      break
    }
    case 'fee_pending': {
      columns = ['Month', 'Fee', 'Paid', 'Balance']
      rows = fees
        .filter((f) => f.status === 'PENDING' || f.status === 'PARTIAL' || f.status === 'OVERDUE')
        .sort((a, b) => b.fee_month.localeCompare(a.fee_month))
        .map((f) => ({
          label: sMap.get(f.student_id) ?? f.student_id,
          sub: f.student_id,
          values: {
            Month: monthLabel(f.fee_month),
            Fee: formatINR(f.amount),
            Paid: formatINR(f.paid_amount),
            Balance: formatINR(f.amount - f.paid_amount),
          },
        }))
      break
    }
    case 'fee_overdue': {
      columns = ['Batch', 'Month', 'Balance']
      rows = fees
        .filter((f) => f.status === 'OVERDUE')
        .map((f) => ({
          label: sMap.get(f.student_id) ?? f.student_id,
          sub: f.student_id,
          values: {
            Batch: batchOfStudent(f.student_id) || '—',
            Month: monthLabel(f.fee_month),
            Balance: formatINR(Math.max(0, f.amount - f.paid_amount)),
          },
        }))
      break
    }
    case 'fee_batch': {
      const map = new Map<string, { n: number; sum: number }>()
      for (const p of payments) {
        const bid = memberships.find((m) => m.student_id === p.student_id && m.status === 'ACTIVE')?.batch_id
        const k = bid ? (bMap.get(bid) ?? 'Unknown') : 'No batch'
        const cur = map.get(k) ?? { n: 0, sum: 0 }
        cur.n += 1
        cur.sum += p.amount
        map.set(k, cur)
      }
      columns = ['Payments', 'Collected']
      rows = Array.from(map.entries()).map(([k, v]) => ({
        label: k,
        values: { Payments: v.n, Collected: formatINR(v.sum) },
      }))
      break
    }
  }

  const doPrint = () => window.print()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">Generated live from your database.</p>
        </div>
        <Button variant="secondary" onClick={doPrint}>
          <Printer className="h-4 w-4" /> Print report
        </Button>
      </div>

      <div id="print-area">
        <div className="no-print mb-2 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? 'rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50'
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Report header with branding */}
        <Card className="mb-3 !border-0 pb-2 shadow-none">
          <div className="flex items-center gap-3">
            <InstituteLogo size={44} />
            <div>
              <h2 className="text-base font-bold text-slate-900">{profile?.institute_name}</h2>
              <p className="text-xs text-slate-500">
                {profile?.address ?? ''} {profile?.city ?? ''}
              </p>
            </div>
            <div className="ml-auto text-right text-xs text-slate-500">
              <p className="font-semibold text-slate-700">{TABS.find((t) => t.id === tab)?.label}</p>
              <p>Generated: {formatDate(todayISO())}</p>
              <p>Generated by: Admin</p>
            </div>
          </div>
        </Card>

        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <Th>Item</Th>
                  {columns.map((c) => (
                    <Th key={c}>{c}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="td text-slate-400" colSpan={columns.length + 1}>
                      No records yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0">
                      <td className="td font-medium">
                        {r.label}
                        {r.sub ? <div className="text-xs font-mono text-slate-400">{r.sub}</div> : null}
                      </td>
                      {columns.map((c) => (
                        <td key={c} className="td">
                          {r.values[c]}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="text-[11px] text-slate-400">
        * A mini report on PRIVATE checkout — generated from your database. Totals reflect records in the system.
      </p>
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</th>
}