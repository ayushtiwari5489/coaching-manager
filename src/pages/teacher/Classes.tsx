import { useCallback, useEffect, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ClipboardCheck, Clock } from 'lucide-react'
import { currentTeacherId, fetchAll } from '../../lib/api'
import type { Batch, Class, TeacherBatch, BatchStudent, Student } from '../../lib/types'
import { Card, Button, PageLoader, useToast, Badge, Select } from '../../components/ui'
import { formatDate, formatTime, relError } from '../../lib/utils'

interface ClassRow extends Class {
  batch_name: string
}

export default function TeacherClasses() {
  const [rows, setRows] = useState<ClassRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [batchFilter, setBatchFilter] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [allClasses, tBatches, teacherBatches, memberships, students] = await Promise.all([
        fetchAll<Class>('classes'),
        fetchAll<Batch>('batches'),
        fetchAll<TeacherBatch>('teacher_batches'),
        fetchAll<BatchStudent>('batch_students'),
        fetchAll<Student>('students'),
      ])
      const tid = await currentTeacherId()
      const tB = tBatches.filter((b) => !b.deleted_at)
      setBatches(tB)
      const bMap = new Map(tB.map((b) => [b.id, b.name]))
      const scope = new Set(tid ? teacherBatches.filter((x) => x.teacher_id === tid).map((x) => x.batch_id) : [])

      const mine = allClasses
        .filter((c) => scope.has(c.batch_id))
        .map((c) => ({
          ...c,
          batch_name: bMap.get(c.batch_id) ?? c.batch_id,
        }))
        .sort((a, b) => (b.class_date ?? '').localeCompare(a.class_date ?? ''))

      const cCounts: Record<string, number> = {}
      for (const c of mine) {
        cCounts[c.id] = new Set(
          memberships
            .filter((m) => m.batch_id === c.batch_id && m.status === 'ACTIVE')
            .map((m) => m.student_id)
        ).size
      }
      void students
      setCounts(cCounts)
      setRows(mine)
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

  // Week range filter
  const base = new Date()
  base.setDate(base.getDate() + weekOffset * 7)
  const dow = (base.getDay() + 6) % 7
  const start = new Date(base); start.setDate(base.getDate() - dow)
  const end = new Date(start); end.setDate(start.getDate() + 6)
  const iso = (d: Date) => d.toLocaleDateString('en-CA')
  const weekLabel = `Week of ${formatDate(iso(start))}`

  const filtered = rows.filter((c) => {
    if (c.class_date && (c.class_date < iso(start) || c.class_date > iso(end))) return false
    if (batchFilter && c.batch_id !== batchFilter) return false
    return true
  })

  const grouped = filtered.reduce<Record<string, ClassRow[]>>((acc, c) => {
    const key = c.class_date ?? ''
    ;(acc[key] = acc[key] ?? []).push(c)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-900">Classes & History</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setWeekOffset(weekOffset - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-32 text-center text-sm font-medium text-slate-700">{weekLabel}</span>
        <Button variant="secondary" onClick={() => setWeekOffset(weekOffset + 1)}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" onClick={() => setWeekOffset(0)} className="text-xs">Today</Button>
        <div className="ml-auto min-w-40">
          <Select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
            <option value="">All my batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card className="py-10 text-center">
          <Calendar className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-600">No classes in this week.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, cls]) => (
              <div key={date}>
                <h2 className="mb-2 px-1 text-sm font-bold text-slate-700">{formatDate(date)}</h2>
                <div className="space-y-2">
                  {cls.map((c) => (
                    <Card key={c.id} className="space-y-2 border-l-4 !border-l-brand-500">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-bold text-slate-900">{c.batch_name}</h3>
                          <p className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="h-3.5 w-3.5" /> {formatTime(c.start_time)} – {formatTime(c.end_time)} · {counts[c.id] ?? 0} students
                          </p>
                        </div>
                        <Badge tone={c.status === 'COMPLETED' ? 'green' : c.status === 'CANCELLED' ? 'red' : 'blue'}>
                          {c.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-end">
                        {c.status === 'COMPLETED' || c.attendance_submitted ? (
                          <Link2 id={c.id} />
                        ) : (
                          <Link2Submit id={c.id} />
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

function Link2({ id }: { id: string }) {
  return (
    <a href={`/teacher/attendance?class=${id}#view`} className="text-xs font-semibold text-green-700 underline">
      Attendance recorded
    </a>
  )
}
function Link2Submit({ id }: { id: string }) {
  return (
    <a href={`/teacher/attendance?class=${id}`} className="text-xs font-semibold text-brand-600 underline">
      Mark attendance
    </a>
  )
}