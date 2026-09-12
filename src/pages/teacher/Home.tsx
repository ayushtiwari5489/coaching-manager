import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Users, ClipboardCheck, Clock, ChevronRight } from 'lucide-react'
import { fetchTodayClassesTeacher, fetchAll } from '../../lib/api'
import type { EnrichedClass, Batch, Teacher } from '../../lib/types'
import { Card, Button, PageLoader, useToast, Badge } from '../../components/ui'
import { formatTime, relError } from '../../lib/utils'

export default function TeacherHome() {
  const [classes, setClasses] = useState<EnrichedClass[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [cls, batches, teachers] = await Promise.all([
        fetchTodayClassesTeacher(),
        fetchAll<Batch>('batches'),
        fetchAll<Teacher>('teachers'),
      ])
      const bMap = new Map(batches.filter((b) => !b.deleted_at).map((b) => [b.id, b.name]))
      const tMap = new Map(teachers.map((t) => [t.id, t.name.split(' ')[0]]))
      const enriched = cls
        .map((c) => ({
          ...c,
          batch_name: bMap.get(c.batch_id) ?? c.batch_id,
          teacher_name: c.teacher_id ? tMap.get(c.teacher_id) ?? 'You' : 'You',
        }))
        .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'))
      setClasses(enriched)
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

  const pending = classes.filter((c) => !c.attendance_submitted)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-bold text-slate-900">Today's Classes</h1>
        <Badge tone={pending.length === 0 ? 'green' : 'amber'}>
          {pending.length === 0 ? 'All submitted' : `${pending.length} pending`}
        </Badge>
      </div>

      {classes.length === 0 ? (
        <Card className="py-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">No classes scheduled today</p>
          <p className="text-xs text-slate-400">Enjoy the day off, or check your class schedule.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {classes.map((c) => (
            <Card key={c.id} className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{c.batch_name}</h3>
                  <p className="text-xs text-slate-500">{c.status === 'CANCELLED' ? 'Cancelled' : c.status === 'COMPLETED' ? 'Completed' : 'Scheduled'}</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">
                  <Clock className="h-4 w-4" />
                  {formatTime(c.start_time)} – {formatTime(c.end_time)}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <Users className="h-4 w-4" /> {formatTime(c.start_time)} – {formatTime(c.end_time)}
                </p>
              </div>
              {c.attendance_submitted ? (
                <div className="flex items-center justify-between rounded-lg bg-green-50 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                    <ClipboardCheck className="h-4 w-4" /> Attendance submitted
                  </p>
                  <Link to="/teacher/attendance" className="text-xs font-semibold text-green-700 underline">
                    View
                  </Link>
                </div>
              ) : (
                <Link to={`/teacher/attendance?class=${c.id}`}>
                  <Button className="w-full !py-3 text-base">
                    <ClipboardCheck className="h-5 w-5" /> Mark Attendance
                  </Button>
                </Link>
              )}
            </Card>
          ))}
        </div>
      )}

      <Link to="/teacher/classes" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
        <span className="text-sm font-medium text-slate-700">View all classes & history</span>
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </Link>
    </div>
  )
}