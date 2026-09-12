import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Plus, Search, GraduationCap, KeyRound } from 'lucide-react'
import { fetchTeachersWithBatches, upsertRow, updateRow, fetchAll, logAudit } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { Teacher, Batch, TeacherBatch } from '../../lib/types'
import {
  Button,
  Card,
  Input,
  Field,
  Modal,
  Badge,
  Table,
  Th,
  Td,
  PageLoader,
  EmptyState,
  useToast,
} from '../../components/ui'
import { relError } from '../../lib/utils'

interface FormState {
  name: string
  phone: string
  email: string
  subject: string
  status: 'ACTIVE' | 'INACTIVE'
}

const emptyForm = (): FormState => ({ name: '', phone: '', email: '', subject: '', status: 'ACTIVE' })

export default function Teachers() {
  const [teachers, setTeachers] = useState<(Teacher & { batch_ids?: string[] })[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [assignments, setAssignments] = useState<TeacherBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState<Teacher | null>(null)
  const [editing, setEditing] = useState<Teacher | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [loginFor, setLoginFor] = useState<Teacher | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [t, b, tb] = await Promise.all([
        fetchTeachersWithBatches(),
        fetchAll<Batch>('batches'),
        fetchAll<TeacherBatch>('teacher_batches'),
      ])
      setTeachers(t)
      setBatches(b)
      setAssignments(tb)
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

  const openEdit = (t: Teacher) => {
    setEditing(t)
    setForm({ name: t.name, phone: t.phone ?? '', email: t.email ?? '', subject: t.subject ?? '', status: t.status })
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
        email: form.email.trim() || null,
        subject: form.subject.trim() || null,
        status: form.status,
      }
      if (editing) {
        await updateRow('teachers', editing.id, payload)
        await logAudit('UPDATE_TEACHER', 'TEACHER', editing.id, payload)
        toast('Teacher updated.')
      } else {
        const inserted = (await upsertRow<Teacher>('teachers', [payload]))[0]
        await logAudit('CREATE_TEACHER', 'TEACHER', inserted.id, payload)
        setLoginFor(inserted)
        setLoginEmail(inserted.email ?? '')
        setLoginPassword('')
        toast('Teacher added. Now set their login credentials.')
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      toast(relError(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const openLogin = (t: Teacher) => {
    setLoginFor(t)
    setLoginEmail(t.email ?? '')
    setLoginPassword('')
  }

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!loginFor) return
    if (!loginEmail.trim() || !/^\S+@\S+\.\S+$/.test(loginEmail.trim())) {
      toast('A valid email is required', 'error')
      return
    }
    if (loginPassword.length < 8) {
      toast('Password must be at least 8 characters', 'error')
      return
    }
    setLoginBusy(true)
    try {
      const { data, error } = await supabase.rpc('create_teacher_login', {
        p_teacher_id: loginFor.id,
        p_name: loginFor.name,
        p_email: loginEmail.trim(),
        p_password: loginPassword,
      })
      if (error) throw new Error(relError(error))
      toast(data?.created !== false ? `Login created for ${loginFor.name}.` : `Password reset for ${loginFor.name}.`)
      setLoginPassword('')
      setLoginFor(null)
      await load()
    } catch (err) {
      toast(relError(err), 'error')
    } finally {
      setLoginBusy(false)
    }
  }

  const filtered = teachers.filter((t) => {
    const q = search.trim().toLowerCase()
    return !q || t.name.toLowerCase().includes(q) || (t.email ?? '').toLowerCase().includes(q) || t.id.includes(q)
  })

  if (loading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Teachers</h1>
          <p className="text-sm text-slate-500">{teachers.length} total</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Add Teacher
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Search teachers…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No teachers found" hint="Add your teachers to get started." action={<Button onClick={openNew}><Plus className="h-4 w-4" /> Add Teacher</Button>} />
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-slate-100">
                <tr>
                  <Th>Teacher</Th>
                  <Th>ID</Th>
                  <Th>Subject</Th>
                  <Th>Batches</Th>
                  <Th>Login</Th>
                  <Th>Status</Th>
                  <Th className="!text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                          <GraduationCap className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{t.name}</div>
                          <div className="text-xs text-slate-400">{t.phone ?? t.email ?? '—'}</div>
                        </div>
                      </div>
                    </Td>
                    <Td className="font-mono text-xs">{t.id}</Td>
                    <Td>{t.subject ?? '—'}</Td>
                    <Td>
                      {t.batch_ids?.map((bid) => batches.find((b) => b.id === bid)?.name ?? bid).join(', ') || '—'}
                    </Td>
                    <Td>
                      {t.user_id ? (
                        <div className="flex items-center gap-2">
                          <Badge tone="green">Active</Badge>
                          <button onClick={() => openLogin(t)} className="text-xs font-semibold text-brand-600 hover:underline">
                            Reset
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => openLogin(t)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Create login
                        </button>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={t.status === 'ACTIVE' ? 'green' : 'slate'}>{t.status}</Badge>
                    </Td>
                    <Td className="!text-right">
                      <Button variant="ghost" className="!px-2" onClick={() => openEdit(t)}>
                        Edit
                      </Button>
                      <Button variant="ghost" className="!px-2" onClick={() => setAssignOpen(t)}>
                        Batches
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add / edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit Teacher — ${editing.name}` : 'Add Teacher'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </>
        }
      >
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full Name" required className="sm:col-span-2">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Subject">
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </Field>
          <Field label="Status">
            <div className="flex gap-2">
              {(['ACTIVE', 'INACTIVE'] as const).map((s) => (
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
        </form>
      </Modal>

      {/* Assign batches */}
      <Modal
        open={assignOpen !== null}
        onClose={() => setAssignOpen(null)}
        title={assignOpen ? `Assign batches to ${assignOpen.name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(null)}>Done</Button>
          </>
        }
      >
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {batches.filter((b) => !b.deleted_at).map((b) => {
            const checked = assignments.some((a) => a.batch_id === b.id && a.teacher_id === assignOpen?.id)
            return (
              <label key={b.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 p-3 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={async (e) => {
                    if (!assignOpen) return
                    try {
                      if (e.target.checked) {
                        await upsertRow('teacher_batches', [{ teacher_id: assignOpen.id, batch_id: b.id }], 'teacher_id,batch_id')
                      } else {
                        const { error } = await supabase
                          .from('teacher_batches')
                          .delete()
                          .eq('teacher_id', assignOpen.id)
                          .eq('batch_id', b.id)
                        if (error) throw new Error(relError(error))
                        await logAudit('UNASSIGN_BATCH', 'TEACHER', assignOpen.id, { batch_id: b.id })
                      }
                      await load()
                    } catch (err) {
                      toast(relError(err), 'error')
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <span className="text-sm font-medium text-slate-800">{b.name}</span>
                <span className="text-xs text-slate-400">{b.subject ?? ''}</span>
              </label>
            )
          })}
        </div>
      </Modal>

      {/* Create / reset login */}
      <Modal
        open={loginFor !== null}
        onClose={() => !loginBusy && setLoginFor(null)}
        title={loginFor?.user_id ? `Reset login — ${loginFor.name}` : `Create login — ${loginFor?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLoginFor(null)} disabled={loginBusy}>Cancel</Button>
            <Button onClick={submitLogin} disabled={loginBusy}>{loginBusy ? 'Creating…' : 'Create login'}</Button>
          </>
        }
      >
        <form onSubmit={submitLogin} className="space-y-3">
          <Field label="Email (used to sign in)" required>
            <Input
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="teacher@institute.com"
            />
          </Field>
          <Field label="Password" required>
            <Input
              type="password"
              required
              minLength={8}
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </Field>
          <p className="text-xs text-slate-500">
            The account is created securely by an admin-only function in your database — no service key is needed here.
            The teacher signs in on the app with this email and password.
          </p>
        </form>
      </Modal>
    </div>
  )
}