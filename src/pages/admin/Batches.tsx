import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Search, Layers, Clock, Users } from 'lucide-react'
import {
  fetchBatchesWithDetails,
  fetchAll,
  upsertRow,
  updateRow,
  logAudit,
  supabase,
} from '../../lib/api'
import type { Batch, Teacher, Student, TeacherBatch, BatchStudent, ClassSchedule } from '../../lib/types'
import {
  Button,
  Card,
  Input,
  Select,
  Field,
  Modal,
  Badge,
  Table,
  Th,
  Td,
  PageLoader,
  EmptyState,
  ConfirmDialog,
  useToast,
} from '../../components/ui'
import { relError, formatTime, dayName } from '../../lib/utils'

const DAYS = [
  { v: 0, label: 'Sun' },
  { v: 1, label: 'Mon' },
  { v: 2, label: 'Tue' },
  { v: 3, label: 'Wed' },
  { v: 4, label: 'Thu' },
  { v: 5, label: 'Fri' },
  { v: 6, label: 'Sat' },
]

interface BatchWithMeta extends Batch {
  teacher_ids?: string[]
  student_count?: number
}

interface FormState {
  name: string
  subject: string
  days: number[]
  start_time: string
  end_time: string
  room: string
  status: 'ACTIVE' | 'INACTIVE'
}

const emptyForm = (): FormState => ({
  name: '',
  subject: '',
  days: [],
  start_time: '',
  end_time: '',
  room: '',
  status: 'ACTIVE',
})

export default function Batches() {
  const [batches, setBatches] = useState<BatchWithMeta[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [scheduleMap, setScheduleMap] = useState<Record<string, ClassSchedule[]>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Batch | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [manageStudents, setManageStudents] = useState<BatchWithMeta | null>(null)
  const [manageSchedule, setManageSchedule] = useState<BatchWithMeta | null>(null)
  const [deactivating, setDeactivating] = useState<Batch | null>(null)
  const [schForm, setSchForm] = useState({ days: [] as number[], start_time: '', end_time: '', room: '', teacher_id: '' })
  const [selStudents, setSelStudents] = useState<string[]>([])
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [b, t, s, sch] = await Promise.all([
        fetchBatchesWithDetails(),
        fetchAll<Teacher>('teachers'),
        fetchAll<Student>('students'),
        fetchAll<ClassSchedule>('class_schedules'),
      ])
      setBatches(b)
      setTeachers(t)
      setStudents(s)
      const sm: Record<string, ClassSchedule[]> = {}
      for (const sc of sch) {
        ;(sm[sc.batch_id] ??= []).push(sc)
      }
      setScheduleMap(sm)
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast('Batch name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        subject: form.subject.trim() || null,
        days: form.days,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        room: form.room.trim() || null,
        status: form.status,
      }
      if (editing) {
        await updateRow('batches', editing.id, payload)
        await logAudit('UPDATE_BATCH', 'BATCH', editing.id, payload)
        toast('Batch updated.')
      } else {
        const b = (await upsertRow<Batch>('batches', [payload]))[0]
        await logAudit('CREATE_BATCH', 'BATCH', b.id, payload)
        toast('Batch created.')
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      toast(relError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const openManageStudents = async (b: BatchWithMeta) => {
    setManageStudents(b)
    const { data } = await supabase.from('batch_students').select('student_id').eq('batch_id', b.id)
    const enrolled = new Set((data ?? []).filter((r) => r.student_id).map((r) => r.student_id as string))
    setSelStudents(students.filter((s) => s.status === 'ACTIVE' && enrolled.has(s.id)).map((s) => s.id))
  }

  const saveManageStudents = async () => {
    if (!manageStudents) return
    setSaving(true)
    try {
      const { data } = await supabase
        .from('batch_students')
        .select('student_id,status')
        .eq('batch_id', manageStudents.id)
      const activeNow = new Set(
        (data ?? [])
          .filter((r) => r.status === 'ACTIVE' && r.student_id)
          .map((r) => r.student_id as string)
      )
      for (const s of students) {
        const on = selStudents.includes(s.id)
        const isEnrolled = activeNow.has(s.id)
        if (on && !isEnrolled) {
          await upsertRow('batch_students', [
            { batch_id: manageStudents.id, student_id: s.id, status: 'ACTIVE', joined_at: new Date().toISOString().slice(0, 10) },
          ], 'batch_id,student_id')
        } else if (!on && isEnrolled) {
          const { error } = await supabase
            .from('batch_students')
            .update({ status: 'REMOVED' })
            .eq('batch_id', manageStudents.id)
            .eq('student_id', s.id)
          if (error) throw new Error(relError(error))
        }
      }
      await logAudit('UPDATE_STUDENTS_BATCH', 'BATCH', manageStudents.id, { count: selStudents.length })
      toast('Batch students updated.')
      setManageStudents(null)
      await load()
    } catch (err) {
      toast(relError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveSchedule = async (e: FormEvent) => {
    e.preventDefault()
    if (!manageSchedule) return
    if (schForm.days.length === 0 || !schForm.start_time || !schForm.end_time) {
      toast('Select days and times', 'error')
      return
    }
    try {
      await upsertRow('class_schedules', [
        {
          batch_id: manageSchedule.id,
          teacher_id: schForm.teacher_id || manageSchedule.teacher_ids?.[0] || null,
          days: schForm.days,
          start_time: schForm.start_time,
          end_time: schForm.end_time,
          room: schForm.room.trim() || null,
          status: 'ACTIVE',
        },
      ])
      await logAudit('CREATE_SCHEDULE', 'BATCH', manageSchedule.id, schForm)
      toast('Schedule added.')
      setSchForm({ days: [], start_time: '', end_time: '', room: '', teacher_id: '' })
      await load()
    } catch (err) {
      toast(relError(err), 'error')
    }
  }

  const filtered = batches.filter((b) => {
    const q = search.trim().toLowerCase()
    return !q || b.name.toLowerCase().includes(q) || b.id.includes(q) || (b.subject ?? '').toLowerCase().includes(q)
  })

  if (loading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Batches</h1>
          <p className="text-sm text-slate-500">{batches.filter((b) => b.status === 'ACTIVE').length} active</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(emptyForm()); setModalOpen(true) }}>
          <Plus className="h-4 w-4" /> Create Batch
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Search batches…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <EmptyState title="No batches yet" hint="Create your first batch." action={
              <Button onClick={() => { setEditing(null); setForm(emptyForm()); setModalOpen(true) }}><Plus className="h-4 w-4" /> Create Batch</Button>
            } />
          </div>
        ) : (
          filtered.map((b) => {
            const schedules = scheduleMap[b.id] ?? []
            const name = teachers.find((t) => b.teacher_ids?.[0] === t.id)?.name
            return (
              <Card key={b.id} className="flex flex-col">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{b.name}</h3>
                      <p className="text-xs font-mono text-slate-400">{b.id}</p>
                    </div>
                  </div>
                  <Badge tone={b.status === 'ACTIVE' ? 'green' : 'slate'}>{b.status}</Badge>
                </div>
                <p className="mb-2 text-sm text-slate-600">{b.subject || '—'}</p>
                <div className="mb-3 space-y-1 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> {b.student_count ?? 0} students
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Teacher: {name ?? 'Not assigned'}
                  </div>
                  {schedules[0] ? (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {schedules[0].days.map((d) => dayName(d).slice(0, 3)).join(', ')} {formatTime(schedules[0].start_time)}–{formatTime(schedules[0].end_time)}
                    </div>
                  ) : null}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={() => openManageStudents(b)}>Students</Button>
                  <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={() => { setManageSchedule(b); setSchForm({ days: [], start_time: '', end_time: '', room: '', teacher_id: b.teacher_ids?.[0] ?? '' }) }}>Schedule</Button>
                  <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={() => { setEditing(b); setForm({ name: b.name, subject: b.subject ?? '', days: b.days, start_time: b.start_time ?? '', end_time: b.end_time ?? '', room: b.room ?? '', status: b.status }); setModalOpen(true) }}>Edit</Button>
                  <Button variant="ghost" className="!px-2 !py-1.5 text-xs !text-red-600" onClick={() => setDeactivating(b)}>Deactivate</Button>
                </div>
              </Card>
            )
          })
        )}
      </div>

      {/* Create / edit batch */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Batch — ${editing.name}` : 'Create Batch'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </>
        }
      >
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Batch Name" required className="sm:col-span-2">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Class 10 Science" />
          </Field>
          <Field label="Subject / Course">
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field label="Room">
            <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
          </Field>
          <Field label="Start Time">
            <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </Field>
          <Field label="End Time">
            <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </Field>
          <Field label="Default Class Days" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => setForm({ ...form, days: form.days.includes(d.v) ? form.days.filter((x) => x !== d.v) : [...form.days, d.v].sort() })}
                  className={
                    form.days.includes(d.v)
                      ? 'rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white'
                      : 'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600'
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Status" className="sm:col-span-2">
            <div className="flex gap-2">
              {(['ACTIVE', 'INACTIVE'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setForm({ ...form, status: s })}
                  className={form.status === s ? 'rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white' : 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600'}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
        </form>
      </Modal>

      {/* Manage students */}
      <Modal
        open={manageStudents !== null}
        onClose={() => setManageStudents(null)}
        title={`Students in ${manageStudents?.name ?? ''}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setManageStudents(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveManageStudents} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </>
        }
      >
        <div className="grid gap-1.5 sm:grid-cols-2">
          {students.filter((s) => s.status === 'ACTIVE').map((s) => (
            <label key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2.5 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selStudents.includes(s.id)}
                onChange={() => setSelStudents((p) => p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id])}
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
              />
              <span className="text-sm font-medium text-slate-800">{s.name}</span>
              <span className="ml-auto text-xs font-mono text-slate-400">{s.id}</span>
            </label>
          ))}
        </div>
      </Modal>

      {/* Manage schedule */}
      <Modal
        open={manageSchedule !== null}
        onClose={() => setManageSchedule(null)}
        title={`Schedules — ${manageSchedule?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setManageSchedule(null)}>Done</Button>
          </>
        }
      >
        <div className="mb-4 space-y-2">
          {(scheduleMap[manageSchedule?.id ?? ''] ?? []).map((sc) => (
            <div key={sc.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm">
              <div>
                <span className="font-medium text-slate-800">
                  {sc.days.map((d) => dayName(d).slice(0, 3)).join(', ')}
                </span>{' '}
                · {formatTime(sc.start_time)}–{formatTime(sc.end_time)}
                {sc.room ? <span> · {sc.room}</span> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={sc.status === 'ACTIVE' ? 'green' : 'slate'}>{sc.status}</Badge>
                <Button variant="ghost" className="!px-2 !py-1 text-xs !text-red-600"
                  onClick={async () => {
                    const { error } = await supabase.from('class_schedules').delete().eq('id', sc.id)
                    if (error) { toast(relError(error), 'error'); return }
                    await load()
                  }}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {scheduleMap[manageSchedule?.id ?? '']?.length === 0 ? (
            <p className="text-sm text-slate-400">No schedules yet. Add one below.</p>
          ) : null}
        </div>
        <form onSubmit={saveSchedule} className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-800">Add a weekly schedule</p>
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Days</p>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button key={d.v} type="button"
                  onClick={() => setSchForm({ ...schForm, days: schForm.days.includes(d.v) ? schForm.days.filter((x) => x !== d.v) : [...schForm.days, d.v].sort() })}
                  className={schForm.days.includes(d.v) ? 'rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white' : 'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600'}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Time"><Input type="time" required value={schForm.start_time} onChange={(e) => setSchForm({ ...schForm, start_time: e.target.value })} /></Field>
            <Field label="End Time"><Input type="time" required value={schForm.end_time} onChange={(e) => setSchForm({ ...schForm, end_time: e.target.value })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Room"><Input value={schForm.room} onChange={(e) => setSchForm({ ...schForm, room: e.target.value })} /></Field>
            <Field label="Teacher">
              <Select value={schForm.teacher_id} onChange={(e) => setSchForm({ ...schForm, teacher_id: e.target.value })}>
                <option value="">Default batch teacher</option>
                {teachers.filter((t) => t.status === 'ACTIVE').map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" className="w-full">Add Schedule</Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        title="Deactivate batch?"
        message={`${deactivating?.name} will be marked INACTIVE. Historical classes and attendance are kept.`}
        onConfirm={async () => {
          if (!deactivating) return
          await updateRow('batches', deactivating.id, { status: 'INACTIVE' })
          await logAudit('DEACTIVATE_BATCH', 'BATCH', deactivating.id, { status: 'INACTIVE' })
          toast('Batch deactivated.')
          await load()
        }}
      />
    </div>
  )
}