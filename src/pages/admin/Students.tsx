import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, UserRound } from 'lucide-react'
import { fetchStudentsWithBatches, upsertRow, updateRow, softDeleteStudent, fetchAll, logAudit } from '../../lib/api'
import type { Student, StudentStatus, Batch } from '../../lib/types'
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
import { formatDate, statusStyle, todayISO, relError } from '../../lib/utils'

const STATUSES: StudentStatus[] = ['ACTIVE', 'INACTIVE', 'COMPLETED']

interface FormState {
  name: string
  phone: string
  parent_name: string
  parent_phone: string
  email: string
  address: string
  course: string
  batch_id: string
  admission_date: string
  monthly_fee: string
  status: StudentStatus
}

const emptyForm = (): FormState => ({
  name: '',
  phone: '',
  parent_name: '',
  parent_phone: '',
  email: '',
  address: '',
  course: '',
  batch_id: '',
  admission_date: todayISO(),
  monthly_fee: '',
  status: 'ACTIVE',
})

export default function Students() {
  const [students, setStudents] = useState<(Student & { batch_ids?: string[] })[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Student | null>(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [stu, bat] = await Promise.all([
        fetchStudentsWithBatches(),
        fetchAll<Batch>('batches').then((b) => b.filter((x) => !x.deleted_at)),
      ])
      setStudents(stu)
      setBatches(bat)
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (s: Student) => {
    const enriched = s as Student & { batch_ids?: string[] }
    setEditing(s)
    setForm({
      name: s.name,
      phone: s.phone ?? '',
      parent_name: s.parent_name ?? '',
      parent_phone: s.parent_phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      course: s.course ?? '',
      batch_id: enriched.batch_ids?.[0] ?? '',
      admission_date: s.admission_date ?? todayISO(),
      monthly_fee: s.monthly_fee ? String(s.monthly_fee) : '',
      status: s.status,
    })
    setModalOpen(true)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast('Name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        parent_name: form.parent_name.trim() || null,
        parent_phone: form.parent_phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        course: form.course.trim() || null,
        admission_date: form.admission_date || null,
        monthly_fee: form.monthly_fee ? parseFloat(form.monthly_fee) : 0,
        status: form.status,
      }
      if (editing) {
        await updateRow('students', editing.id, payload)
        const memberBatches = (editing as Student & { batch_ids?: string[] }).batch_ids ?? []
        if (form.batch_id && !memberBatches.includes(form.batch_id)) {
          await upsertRow('batch_students', [
            { batch_id: form.batch_id, student_id: editing.id, status: 'ACTIVE', joined_at: form.admission_date || todayISO() },
          ], 'batch_id,student_id')
        }
        await logAudit('UPDATE_STUDENT', 'STUDENT', editing.id, payload)
        toast('Student updated.')
      } else {
        const inserted = (await upsertRow<Student>('students', [payload]))[0]
        if (form.batch_id) {
          await upsertRow('batch_students', [
            { batch_id: form.batch_id, student_id: inserted.id, status: 'ACTIVE', joined_at: form.admission_date || todayISO() },
          ], 'batch_id,student_id')
        }
        await logAudit('CREATE_STUDENT', 'STUDENT', inserted.id, payload)
        toast('Student added.')
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase()
    const matchQ =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      (s.phone ?? '').includes(q) ||
      (s.parent_phone ?? '').includes(q)
    const matchStatus = statusFilter === 'ALL' || s.status === statusFilter
    return matchQ && matchStatus
  })

  if (loading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500">{students.length} total</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Add Student
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Search by name, ID, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No students found"
          hint="Add your first student to get started."
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add Student
            </Button>
          }
        />
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <Th>Student</Th>
                  <Th>ID</Th>
                  <Th>Phone</Th>
                  <Th>Batch</Th>
                  <Th>Fee</Th>
                  <Th>Status</Th>
                  <Th className="!text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <Td>
                      <Link to={`/app/students/${s.id}`} className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                          <UserRound className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{s.name}</div>
                          <div className="text-xs text-slate-400">Admitted {formatDate(s.admission_date)}</div>
                        </div>
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{s.id}</Td>
                    <Td>{s.phone ?? s.parent_phone ?? '—'}</Td>
                    <Td>{s.batch_ids?.map((b) => batches.find((x) => x.id === b)?.name).filter(Boolean).join(', ') || '—'}</Td>
                    <Td>{s.monthly_fee ? `₹${s.monthly_fee}` : '—'}</Td>
                    <Td>
                      <Badge tone={s.status === 'ACTIVE' ? 'green' : s.status === 'INACTIVE' ? 'slate' : 'blue'}>
                        {s.status}
                      </Badge>
                    </Td>
                    <Td className="!text-right">
                      <Button variant="ghost" className="!px-2" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="!px-2 !text-red-600"
                        onClick={() => setDeleting(s)}
                      >
                        {s.status === 'ACTIVE' ? 'Deactivate' : 'Delete'}
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Student — ${editing.name}` : 'Add Student'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Student Name" required className="sm:col-span-2">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Parent / Guardian Name">
            <Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
          </Field>
          <Field label="Parent Phone">
            <Input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Course / Subject">
            <Input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} />
          </Field>
          <Field label="Batch">
            <Select value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })}>
              <option value="">No batch</option>
              {batches.filter((b) => b.status === 'ACTIVE').map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Admission Date">
            <Input type="date" value={form.admission_date} onChange={(e) => setForm({ ...form, admission_date: e.target.value })} />
          </Field>
          <Field label="Monthly Fee (₹)">
            <Input
              type="number"
              min="0"
              value={form.monthly_fee}
              onChange={(e) => setForm({ ...form, monthly_fee: e.target.value })}
            />
          </Field>
          <Field label="Status" className="sm:col-span-2">
            <div className="flex gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, status: s })}
                  className={
                    form.status === s
                      ? 'rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white'
                      : 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600'
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting?.status === 'ACTIVE' ? 'Deactivate student?' : 'Delete student?'}
        message={
          deleting?.status === 'ACTIVE'
            ? `${deleting?.name} will be marked INACTIVE. All attendance, fee and payment history is kept.`
            : `${deleting?.name} will be marked with deleted_at. Historical records are preserved. You can restore this later.`
        }
        confirmLabel={deleting?.status === 'ACTIVE' ? 'Deactivate' : 'Delete'}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await softDeleteStudent(deleting.id, deleting.status === 'ACTIVE' ? 'INACTIVE' : 'INACTIVE')
            await logAudit('DEACTIVATE_STUDENT', 'STUDENT', deleting.id, { status: 'INACTIVE' })
            toast('Student deactivated.')
            await load()
          } catch (e) {
            toast(relError(e), 'error')
          }
        }}
      />
    </div>
  )
}