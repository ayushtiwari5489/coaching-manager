import { useCallback, useEffect, useState } from 'react'
import { WifiOff, ClipboardCheck } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { useProfile } from '../../lib/profile'
import { currentTeacherId, fetchAll } from '../../lib/api'
import { getQueue, syncQueue, useOnline } from '../../lib/offline'
import type { Batch, Teacher, TeacherBatch } from '../../lib/types'
import { Card, Button, PageLoader, useToast, Badge } from '../../components/ui'
import { formatDate, greeting, relError } from '../../lib/utils'

export default function TeacherProfile() {
  const { session } = useAuth()
  const { profile } = useProfile()
  const online = useOnline()
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [queueCount, setQueueCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const refreshQueue = useCallback(() => setQueueCount(getQueue().length), [])

  useEffect(() => {
    ;(async () => {
      try {
        const [teachers, tBatches, teacherBatches] = await Promise.all([
          fetchAll<Teacher>('teachers'),
          fetchAll<Batch>('batches'),
          fetchAll<TeacherBatch>('teacher_batches'),
        ])
        const tid = await currentTeacherId()
        const found = tid ? teachers.find((t) => t.id === tid) ?? null : null
        setTeacher(found)
        if (found) {
          const myBatchIds = new Set(
            teacherBatches.filter((x) => x.teacher_id === found.id).map((x) => x.batch_id)
          )
          setBatches(tBatches.filter((b) => !b.deleted_at && myBatchIds.has(b.id)))
        }
      } catch (e) {
        toast(relError(e), 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [session, toast])

  useEffect(() => {
    if (online) {
      ;(async () => {
        const res = await syncQueue()
        if (res.synced > 0) toast(`Synced ${res.synced} offline attendance record${res.synced === 1 ? '' : 's'}.`)
      })()
    }
  }, [online, toast])

  useEffect(() => {
    refreshQueue()
  }, [refreshQueue])

  if (loading) return <PageLoader />

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white">
          {teacher ? teacher.name.charAt(0) : '?'}
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">{teacher?.name ?? 'Team member'}</h1>
          <p className="text-sm text-slate-500">
            {teacher?.phone ? `${teacher.phone} · ` : ''}{teacher?.email ?? session?.user.email}
          </p>
          <p className="text-xs text-slate-400">Hi {teacher?.name.split(' ')[0] ?? 'there'}, {greeting().toLowerCase()}.</p>
        </div>
      </Card>

      {queueCount > 0 ? (
        <Card className="space-y-2 border-amber-200 bg-amber-50">
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
            <WifiOff className="h-4 w-4" /> {queueCount} attendance record{queueCount === 1 ? '' : 's'} waiting offline
          </p>
          <Button className="!py-2 text-sm" disabled={!online || syncing} onClick={async () => {
            setSyncing(true)
            try {
              const res = await syncQueue()
              toast(`Synced ${res.synced} record${res.synced === 1 ? '' : 's'}${res.failed ? `, ${res.failed} failed` : ''}.`)
            } finally {
              setSyncing(false)
              refreshQueue()
            }
          }}>
            {online ? (syncing ? 'Syncing…' : 'Sync now') : 'Offline — will sync later'}
          </Button>
        </Card>
      ) : (
        <Card className="flex items-center gap-2 text-sm text-slate-500">
          <ClipboardCheck className="h-5 w-5 text-green-600" /> All attendance records are synced.
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-base font-semibold text-slate-900">My Batches</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-slate-500">No batches assigned yet. Ask the Admin to assign you.</p>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{b.name}</p>
                  <p className="text-xs text-slate-400">
                    {b.days?.length ? `${b.days.join(', ')} · ` : ''}{b.start_time} – {b.end_time}
                  </p>
                </div>
                <Badge tone="blue">{b.subject || 'General'}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-base font-semibold text-slate-900">Institute</h2>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">{profile?.institute_name ?? '[YOUR INSTITUTE NAME]'}</p>
            <p className="text-xs text-slate-500">
              Session: {profile?.academic_session || '—'} · {profile?.city || profile?.locality || '—'}
            </p>
          </div>
          <p className="text-xs text-slate-400">{formatDate(new Date().toISOString())}</p>
        </div>
      </Card>

      <p className="pb-2 text-center text-[11px] text-slate-400">
        {profile?.institute_name ?? 'Institute'} — Staff app · {new Date().getFullYear()}
      </p>
    </div>
  )
}