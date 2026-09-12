import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  GraduationCap,
  Layers,
  CalendarDays,
  ClipboardCheck,
  UserCheck,
  UserX,
  IndianRupee,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { fetchDashboardStats, fetchTodayClassesAdmin, fetchAll, recomputeFeeStatus } from '../../lib/api'
import type { DashStats, ClassItem, Batch, Teacher, EnrichedClass } from '../../lib/types'
import { StatCard, Card, Badge, PageLoader, Button, useToast } from '../../components/ui'
import { formatTime, todayISO, formatINR } from '../../lib/utils'

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashStats | null>(null)
  const [classes, setClasses] = useState<EnrichedClass[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshingFees, setRefreshingFees] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [s, cls, batches, teachers] = await Promise.all([
        fetchDashboardStats(),
        fetchTodayClassesAdmin(),
        fetchAll<Batch>('batches'),
        fetchAll<Teacher>('teachers'),
      ])
      const bMap = new Map(batches.filter((b) => !b.deleted_at).map((b) => [b.id, b]))
      const tMap = new Map(teachers.map((t) => [t.id, t]))
      const enriched = cls
        .filter((c) => c.attendance_submitted === false)
        .filter((c) => bMap.has(c.batch_id))
        .map((c) => {
          const b = bMap.get(c.batch_id)!
          return {
            ...c,
            batch_name: b.name,
            teacher_name: c.teacher_id ? tMap.get(c.teacher_id)?.name ?? '—' : '—',
          } as EnrichedClass
        })
        .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
      setStats(s)
      setClasses(enriched)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <PageLoader />

  const pendingCount = classes.filter((c) => !c.attendance_submitted).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
        <Button variant="secondary" onClick={() => load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Total Students" value={stats?.students_total ?? 0} icon={<Users className="h-5 w-5" />} tone="blue" />
        <StatCard label="Active Teachers" value={stats?.teachers_active ?? 0} icon={<GraduationCap className="h-5 w-5" />} tone="green" />
        <StatCard label="Active Batches" value={stats?.batches_active ?? 0} icon={<Layers className="h-5 w-5" />} tone="default" />
        <StatCard label="Today's Classes" value={stats?.classes_today ?? 0} icon={<CalendarDays className="h-5 w-5" />} tone="blue" />
        <StatCard
          label="Attendance Completed"
          value={`${stats?.attendance_submitted_today ?? 0}/${stats?.classes_today ?? 0}`}
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone={pendingCount > 0 ? 'amber' : 'green'}
          sub={pendingCount > 0 ? `${pendingCount} pending` : 'All done'}
        />
        <StatCard label="Students Present Today" value={stats?.present_today ?? 0} icon={<UserCheck className="h-5 w-5" />} tone="green" />
        <StatCard label="Students Absent Today" value={(stats?.absent_today ?? 0) + (stats?.late_today ?? 0)} icon={<UserX className="h-5 w-5" />} tone="red" />
        <StatCard label="Fees Collected This Month" value={formatINR(stats?.fees_collected_month ?? 0)} icon={<IndianRupee className="h-5 w-5" />} tone="green" />
        <StatCard label="Fees Pending this Month" value={formatINR(stats?.fees_pending_month ?? 0)} icon={<IndianRupee className="h-5 w-5" />} tone="amber" />
        <StatCard label="Overdue Amount" value={formatINR(stats?.fees_overdue ?? 0)} icon={<AlertTriangle className="h-5 w-5" />} tone="red" sub={`${stats?.overdue_count ?? 0} students`} />
      </div>

      {/* Today's classes */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Today's Classes</h2>
          <span className="text-xs text-slate-500">{todayISO()}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Batch</th>
                <th className="th">Teacher</th>
                <th className="th">Time</th>
                <th className="th">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {classes.length === 0 ? (
                <tr>
                  <td className="td text-slate-400" colSpan={4}>
                    No classes scheduled for today.
                  </td>
                </tr>
              ) : (
                classes.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="td font-medium">{c.batch_name}</td>
                    <td className="td">{c.teacher_name}</td>
                    <td className="td">{formatTime(c.start_time)}</td>
                    <td className="td">
                      <Badge tone={c.attendance_submitted ? 'green' : 'amber'}>
                        {c.attendance_submitted ? 'Completed' : 'Pending'}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Attendance alerts */}
      {pendingCount > 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-amber-900">
            <AlertTriangle className="h-5 w-5" /> Attendance pending ({pendingCount})
          </h2>
          <div className="space-y-2">
            {classes.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-white p-3 text-sm">
                <div>
                  <div className="font-medium text-slate-800">
                    Teacher: {c.teacher_name} · Batch: {c.batch_name}
                  </div>
                  <div className="text-xs text-slate-500">Time: {formatTime(c.start_time)}</div>
                </div>
                <Link
                  to="/app/attendance"
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  View
                </Link>
              </div>
            ))}
            {pendingCount > 5 ? <p className="text-xs text-amber-700">…and {pendingCount - 5} more</p> : null}
          </div>
        </Card>
      ) : null}

      {/* Fee alerts */}
      {(stats?.overdue_count ?? 0) > 0 ? (
        <Card className="border-red-200 bg-red-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-red-900">
                <AlertTriangle className="h-5 w-5" /> Fee alert
              </h2>
              <p className="text-sm text-red-800">
                {stats?.overdue_count} student{stats?.overdue_count === 1 ? '' : 's'} have overdue fees
                (₹{formatINR(stats?.fees_overdue ?? 0)}).
              </p>
            </div>
            <div className="flex gap-2">
              <Link to="/app/fees">
                <Button variant="secondary">View pending fees</Button>
              </Link>
              <Button
                variant="danger"
                disabled={refreshingFees}
                onClick={async () => {
                  setRefreshingFees(true)
                  try {
                    const n = await recomputeFeeStatus()
                    toast(`Fee statuses recomputed (${n} records).`, 'success')
                    await load()
                  } catch (e) {
                    toast((e as Error).message, 'error')
                  } finally {
                    setRefreshingFees(false)
                  }
                }}
              >
                Recalculate statuses
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  )
}