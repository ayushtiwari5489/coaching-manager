import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ClipboardCheck, WifiOff, XCircle, History, CheckCheck, ChevronRight } from 'lucide-react'
import { fetchAll, fetchBy, fetchTodayClassesTeacher, submitAttendance } from '../../lib/api'
import { getQueue, syncQueue, enqueueAttendance, useOnline } from '../../lib/offline'
import type { Batch, Student, BatchStudent } from '../../lib/types'
import { Card, Button, PageLoader, useToast, Badge, Modal } from '../../components/ui'
import { formatDate, formatTime, relError } from '../../lib/utils'

interface AttendanceCtx {
  class_id: string
  batch_id: string
  batch_name: string
  date: string
  start?: string | null
  end?: string | null
  students: { id: string; name: string; roll: string }[]
}

type Status = 'P' | 'A'

export default function TeacherAttendance() {
  const [searchParams] = useSearchParams()
  const initialClass = searchParams.get('class') ?? undefined
  const online = useOnline()

  const [ctx, setCtx] = useState<AttendanceCtx | null>(null)
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewClass, setViewClass] = useState<AttendanceCtx | null>(null)
  const [viewAtt, setViewAtt] = useState<Record<string, string>>({})
  const [queueInfo, setQueueInfo] = useState<{ count: number; busy: boolean }>({ count: 0, busy: false })
  const { toast } = useToast()

  const refreshQueue = useCallback(() => {
    const q = getQueue()
    setQueueInfo({ count: q.length, busy: false })
  }, [])

  useEffect(() => {
    refreshQueue()
  }, [refreshQueue, online])

  useEffect(() => {
    ;(async () => {
      try {
        const [batches, students, memberships, today] = await Promise.all([
          fetchAll<Batch>('batches'),
          fetchAll<Student>('students'),
          fetchAll<BatchStudent>('batch_students'),
          fetchTodayClassesTeacher(),
        ])
        const bMap = new Map(batches.filter((b) => !b.deleted_at).map((b) => [b.id, b.name]))

        const target = initialClass
          ? today.find((c) => c.id === initialClass) ?? today[0]
          : today[0]

        if (target) {
          const rosterIds = new Set(
            memberships
              .filter((m) => m.batch_id === target.batch_id && m.status === 'ACTIVE')
              .map((m) => m.student_id)
          )
          const roster = students
            .filter((s) => s.status === 'ACTIVE' && rosterIds.has(s.id))
            .sort((a, b) => (a.roll_no ?? '').localeCompare(b.roll_no ?? '') || a.name.localeCompare(b.name))
          setCtx({
            class_id: target.id,
            batch_id: target.batch_id,
            batch_name: bMap.get(target.batch_id) ?? target.batch_id,
            date: target.class_date ?? '',
            start: target.start_time,
            end: target.end_time,
            students: roster.map((s) => ({ id: s.id, name: s.name, roll: s.roll_no ?? '' })),
          })
          setStatuses(Object.fromEntries(roster.map((s) => [s.id, 'P'])))
        } else {
          setCtx(null)
        }
      } catch (e) {
        toast(relError(e), 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [initialClass, toast])

  const toggle = (id: string) =>
    setStatuses((prev) => ({ ...prev, [id]: prev[id] === 'P' ? 'A' : 'P' }))

  const setAll = (s: Status) =>
    setStatuses(Object.fromEntries(Object.keys(statuses).map((id) => [id, s])))

  const presentCount = useMemo(
    () => Object.values(statuses).filter((s) => s === 'P').length,
    [statuses]
  )

  const doSubmit = async () => {
    if (!ctx) return
    const absent = ctx.students.filter((s) => statuses[s.id] === 'A').map((s) => s.id)
    const rows =
      absent.length === 0
        ? ctx.students.map((s) => ({ student_id: s.id, status: 'PRESENT' }))
        : ctx.students.map((s) => ({
            student_id: s.id,
            status: absent.includes(s.id) ? 'ABSENT' : 'PRESENT',
          }))
    setSubmitting(true)
    try {
      if (!online) {
        enqueueAttendance(ctx.class_id, rows)
        toast('No internet — saved for later sync.', 'info')
      } else {
        await submitAttendance(ctx.class_id, rows)
        toast(`Attendance submitted for ${ctx.batch_name}.`)
      }
      await refreshQueue()
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const doSync = async () => {
    setQueueInfo((q) => ({ ...q, busy: true }))
    try {
      const res = await syncQueue((done, total) => {
        setQueueInfo({ count: total - done, busy: true })
      })
      toast(`Synced ${res.synced} record${res.synced === 1 ? '' : 's'}${res.failed ? `, ${res.failed} failed` : ''}.`)
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      refreshQueue()
    }
  }

  const openView = async (cls: AttendanceCtx) => {
    setViewClass(cls)
    try {
      const atts = await fetchBy<Record<string, unknown>>('attendance', 'class_id', cls.class_id)
      const flat: Record<string, string> = {}
      for (const a of atts) flat[String(a.student_id)] = String(a.status)
      setViewAtt(flat)
    } catch {
      setViewAtt({})
    }
    setViewOpen(true)
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-4 pb-24">
      {/* Offline queue banner */}
      {queueInfo.count > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm text-amber-800">
            <WifiOff className="h-4 w-4" /> {queueInfo.count} offline record{queueInfo.count === 1 ? '' : 's'} waiting
          </p>
          {online && (
            <Button variant="secondary" className="!py-1 text-xs" disabled={queueInfo.busy} onClick={doSync}>
              Sync now
            </Button>
          )}
        </div>
      )}

      {!ctx ? (
        <Card className="py-10 text-center">
          <ClipboardCheck className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">No class selected</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
            Open a class from Home or the Classes page, then come back here to mark attendance.
          </p>
        </Card>
      ) : (
        <>
          <Card className="space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{ctx.batch_name}</h2>
              <Badge tone={ctx.students.length ? 'blue' : 'slate'}>{ctx.students.length} students</Badge>
            </div>
            <p className="text-sm text-slate-500">
              {formatDate(ctx.date)} · {formatTime(ctx.start)} – {formatTime(ctx.end)}
            </p>
            <p className="flex items-center gap-1.5 pt-1 text-sm font-medium text-slate-700">
              <CheckCheck className="h-4 w-4 text-green-600" /> Present: {presentCount}/{ctx.students.length}
            </p>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="!py-2 text-sm" onClick={() => setAll('P')}>All Present</Button>
              <Button variant="ghost" className="!py-2 text-sm" onClick={() => setAll('A')}>All Absent</Button>
            </div>
          </Card>

          <div className="space-y-2">
            {ctx.students.map((s) => (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={
                  statuses[s.id] === 'P'
                    ? 'flex w-full items-center justify-between rounded-xl border-2 border-green-200 bg-green-50 px-3 py-2.5'
                    : 'flex w-full items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5'
                }
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {s.name.charAt(0)}
                  </span>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-400">Roll {s.roll || '—'}</p>
                  </div>
                </div>
                <Badge tone={statuses[s.id] === 'P' ? 'green' : 'red'}>
                  {statuses[s.id] === 'P' ? 'Present' : 'Absent'}
                </Badge>
              </button>
            ))}
          </div>

          <div className="sticky bottom-20">
            <Button className="w-full !py-3.5 text-base shadow-lg" disabled={submitting || ctx.students.length === 0} onClick={doSubmit}>
              {submitting ? 'Submitting…' : online ? `Submit Attendance (${presentCount}/${ctx.students.length})` : 'Save for later'}
            </Button>
          </div>
        </>
      )}

      {/* History: list of recents */}
      <div className="mt-2">
        <p className="mb-2 flex items-center gap-1.5 px-1 text-sm font-bold text-slate-700">
          <History className="h-4 w-4" /> Recent attendance
        </p>
        <RecentList onOpen={(c) => openView(c)} currentBatchName={ctx?.batch_name} />
      </div>

      <AttendanceViewModal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        ctx={viewClass}
        att={viewAtt}
      />
    </div>
  )
}

function RecentList({ onOpen, currentBatchName }: { onOpen: (c: AttendanceCtx) => void; currentBatchName?: string }) {
  const [recents, setRecents] = useState<AttendanceCtx[]>([])
  useEffect(() => {
    ;(async () => {
      try {
        const [cls, batches, students, memberships] = await Promise.all([
          fetchTodayClassesTeacher(),
          fetchAll<Batch>('batches'),
          fetchAll<Student>('students'),
          fetchAll<BatchStudent>('batch_students'),
        ])
        const bMap = new Map(batches.filter((b) => !b.deleted_at).map((b) => [b.id, b.name]))
        const rosterByBatch = (batchId: string) => {
          const ids = new Set(
            memberships.filter((m) => m.batch_id === batchId && m.status === 'ACTIVE').map((m) => m.student_id)
          )
          return students
            .filter((s) => s.status === 'ACTIVE' && ids.has(s.id))
            .sort((a, b) => (a.roll_no ?? '').localeCompare(b.roll_no ?? '') || a.name.localeCompare(b.name))
        }
        const list: AttendanceCtx[] = cls.map((c) => ({
          class_id: c.id,
          batch_id: c.batch_id,
          batch_name: bMap.get(c.batch_id) ?? c.batch_id,
          date: c.class_date ?? '',
          start: c.start_time,
          end: c.end_time,
          students: rosterByBatch(c.batch_id).map((s) => ({ id: s.id, name: s.name, roll: s.roll_no ?? '' })),
        }))
        setRecents(list)
      } catch {
        setRecents([])
      }
    })()
  }, [currentBatchName])

  if (recents.length === 0)
    return <p className="px-1 text-xs text-slate-400">Today's classes appear here after you mark them.</p>

  return (
    <div className="space-y-2">
      {recents.map((c) => (
        <button key={c.class_id} onClick={() => onOpen(c)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="text-left">
            <p className="text-sm font-semibold text-slate-800">{c.batch_name}</p>
            <p className="text-xs text-slate-400">{formatDate(c.date)} · {formatTime(c.start)}</p>
          </div>
          <ChevronFwd />
        </button>
      ))}
    </div>
  )
}

function ChevronFwd() {
  return <ChevronRight className="h-5 w-5 text-slate-400" />
}

function AttendanceViewModal({
  open,
  onClose,
  ctx,
  att,
}: {
  open: boolean
  onClose: () => void
  ctx: AttendanceCtx | null
  att: Record<string, string>
}) {
  return (
    <Modal open={open} onClose={onClose} title={ctx ? `${ctx.batch_name} — Attendance` : ''} footer={<Button onClick={onClose}>Close</Button>}>
      {ctx ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{formatDate(ctx.date)} · {formatTime(ctx.start)} – {formatTime(ctx.end)}</p>
          {ctx.students.length === 0 ? (
            <p className="text-sm text-slate-500">No students in this batch.</p>
          ) : (
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {ctx.students.map((s) => {
                const st = att[s.id]
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                    <p className="text-sm font-medium text-slate-800">{s.name}</p>
                    {st === 'ABSENT' ? (
                      <Badge tone="red"><XCircle className="h-3.5 w-3.5" /> Absent</Badge>
                    ) : (
                      <Badge tone="green">Present</Badge>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  )
}