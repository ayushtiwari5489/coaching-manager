import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ShieldCheck, UserCog, Database, ImagePlus, X as XIcon } from 'lucide-react'
import { useProfile } from '../../lib/profile'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { InstituteLogo } from '../../components/branding'
import { Button, Card, Input, Textarea, Field, PageLoader, useToast } from '../../components/ui'
import { relError } from '../../lib/utils'
import { logAudit } from '../../lib/api'

type Tab = 'profile' | 'security' | 'account'

interface ProfileForm {
  institute_name: string
  short_name: string
  tagline: string
  phone: string
  whatsapp: string
  email: string
  website: string
  address: string
  locality: string
  city: string
  state: string
  pincode: string
  courses: string
  classes: string
  academic_session: string
  timezone: string
}

interface AdminForm {
  admin_name: string
  admin_phone: string
  admin_email: string
}

const PLACEHOLDER_HINTS: Record<string, string[]> = {
  institute_name: ['Placeholders like [YOUR INSTITUTE NAME] appear until you type your institute\'s real name.'],
  tagline: ['Leave empty to hide the tagline.'],
  logo: ['PNG, JPG or WebP. Replaces the default logo everywhere instantly.'],
}

export default function Settings() {
  const [tab, setTab] = useState<Tab>('profile')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Manage your institute's identity, security and account.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <TabBtn active={tab === 'profile'} onClick={() => setTab('profile')} icon={<Building2 className="h-4 w-4" />}>Institute Profile &amp; Branding</TabBtn>
        <TabBtn active={tab === 'security'} onClick={() => setTab('security')} icon={<ShieldCheck className="h-4 w-4" />}>Security</TabBtn>
        <TabBtn active={tab === 'account'} onClick={() => setTab('account')} icon={<UserCog className="h-4 w-4" />}>Account</TabBtn>
        <Link to="/app/data" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Database className="h-4 w-4" /> Data &amp; Backup
        </Link>
      </div>

      {tab === 'profile' ? <InstituteProfileTab /> : null}
      {tab === 'security' ? <SecurityTab /> : null}
      {tab === 'account' ? <AccountTab /> : null}
    </div>
  )
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white'
          : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'
      }
    >
      {icon}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------- Institute Profile */

function InstituteProfileTab() {
  const { profile, loading, save, uploadLogo, removeLogo, refresh } = useProfile()
  const { refresh: refreshAuth, admin } = useAuth()
  const [form, setForm] = useState<ProfileForm | null>(null)
  const [adminForm, setAdminForm] = useState<AdminForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (profile && !form) {
      setForm({
        institute_name: profile.institute_name,
        short_name: profile.short_name,
        tagline: profile.tagline ?? '',
        phone: profile.phone ?? '',
        whatsapp: profile.whatsapp ?? '',
        email: profile.email ?? '',
        website: profile.website ?? '',
        address: profile.address ?? '',
        locality: profile.locality ?? '',
        city: profile.city ?? '',
        state: profile.state ?? '',
        pincode: profile.pincode ?? '',
        courses: profile.courses ?? '',
        classes: profile.classes ?? '',
        academic_session: profile.academic_session ?? '',
        timezone: profile.timezone,
      })
      setDirty(false)
    }
  }, [profile, form])

  useEffect(() => {
    if (admin) setAdminForm({ admin_name: admin.admin_name ?? '', admin_phone: admin.admin_phone ?? '', admin_email: admin.admin_email ?? '' })
  }, [admin])

  if (loading) return <PageLoader />

  if (!form) return null

  const set = (patch: Partial<ProfileForm>) => {
    setForm({ ...form!, ...patch })
    setDirty(true)
  }

  const saveAll = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    if (!form.institute_name.trim()) {
      toast('Institute name is required', 'error')
      return
    }
    setSaving(true)
    try {
      await save({
        institute_name: form.institute_name.trim(),
        short_name: form.short_name.trim() || form.institute_name.trim(),
        tagline: form.tagline.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        locality: form.locality.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
        courses: form.courses.trim() || null,
        classes: form.classes.trim() || null,
        academic_session: form.academic_session.trim() || null,
        timezone: form.timezone,
      })
      await logAudit('UPDATE_PROFILE', 'INSTITUTE', 'main', {})
      if (adminForm) {
        const { error } = await supabase.from('admin_profile').upsert({ id: 'main', ...adminForm }, { onConflict: 'id' })
        if (error) throw new Error(relError(error))
        await logAudit('UPDATE_ADMIN_PROFILE', 'ADMIN', 'main', {})
        await refreshAuth()
      }
      setDirty(false)
      toast('Institute profile updated successfully.')
    } catch (err) {
      toast(relError(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const onUploadLogo = async (file: File | undefined) => {
    if (!file) return
    if (!/image\/(png|jpe?g|webp)/.test(file.type)) {
      toast('Use PNG, JPG or WebP logo', 'error')
      return
    }
    const res = await uploadLogo(file)
    if (res.error) toast(res.error, 'error')
    else toast('Logo updated. It now appears everywhere.')
  }

  return (
    <form onSubmit={saveAll} className="space-y-4">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Institute Profile &amp; Branding</h2>
            <p className="text-xs text-slate-500">Single source of truth — shown on login, reports and receipts.</p>
          </div>
          <Divider />
        </div>

        {/* Logo */}
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-slate-100 p-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
            <InstituteLogo size={72} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Institute Logo</p>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
                  <ImagePlus className="h-4 w-4" /> Upload / Replace
                </span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onUploadLogo(e.target.files?.[0])} />
              </label>
              {profile?.logo_url ? (
                <Button type="button" variant="ghost" className="!text-red-600" onClick={async () => {
                  await removeLogo()
                  toast('Logo removed.')
                }}>
                  <XIcon className="h-4 w-4" /> Remove
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-slate-400">{PLACEHOLDER_HINTS.logo[0]}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Institute Name" required className="sm:col-span-2">
            <Input required value={form.institute_name} onChange={(e) => set({ institute_name: e.target.value })} placeholder="[YOUR INSTITUTE NAME]" />
            <Hint text={PLACEHOLDER_HINTS.institute_name[0]} />
          </Field>
          <Field label="Short Name">
            <Input value={form.short_name} onChange={(e) => set({ short_name: e.target.value })} placeholder="[SHORT NAME / INITIALS]" />
          </Field>
          <Field label="Tagline">
            <Input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder="[YOUR TAGLINE]" />
          </Field>
          <Field label="Academic Session">
            <Input value={form.academic_session} onChange={(e) => set({ academic_session: e.target.value })} placeholder="2026–27" />
          </Field>
          <Field label="Courses / Subjects">
            <Input value={form.courses} onChange={(e) => set({ courses: e.target.value })} placeholder="[COURSES / SUBJECTS]" />
          </Field>
          <Field label="Classes / Grades">
            <Input value={form.classes} onChange={(e) => set({ classes: e.target.value })} placeholder="[CLASSES / GRADES]" />
          </Field>
          <Field label="Timezone used for attendance dates">
            <select className="input" value={form.timezone} onChange={(e) => set({ timezone: e.target.value })}>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
        </div>

        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Contact Information</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone Number">
            <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="[INSTITUTE PHONE NUMBER]" />
          </Field>
          <Field label="WhatsApp Number">
            <Input value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="[WHATSAPP NUMBER]" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="[INSTITUTE EMAIL]" />
          </Field>
          <Field label="Website">
            <Input value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="[INSTITUTE WEBSITE]" />
          </Field>
        </div>

        <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Institute Address</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full Address" className="sm:col-span-2">
            <Textarea value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="[FULL INSTITUTE ADDRESS]" />
          </Field>
          <Field label="Area / Locality">
            <Input value={form.locality} onChange={(e) => set({ locality: e.target.value })} placeholder="[AREA / LOCALITY]" />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="[CITY]" />
          </Field>
          <Field label="State">
            <Input value={form.state} onChange={(e) => set({ state: e.target.value })} placeholder="[STATE]" />
          </Field>
          <Field label="PIN Code">
            <Input value={form.pincode} onChange={(e) => set({ pincode: e.target.value })} placeholder="[PIN CODE]" />
          </Field>
        </div>
      </Card>

      {/* Admin profile — visually separate */}
      <Card>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Admin Profile</h2>
        <p className="mb-3 text-xs text-slate-500">
          Your private contact details. Not shown to teachers. Used on receipts as "Received by" and in audit logs.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Admin Name">
            <Input value={adminForm?.admin_name ?? ''} onChange={(e) => { setAdminForm({ ...adminForm!, admin_name: e.target.value }); setDirty(true) }} placeholder="[ADMIN NAME]" />
          </Field>
          <Field label="Admin Phone">
            <Input value={adminForm?.admin_phone ?? ''} onChange={(e) => { setAdminForm({ ...adminForm!, admin_phone: e.target.value }); setDirty(true) }} placeholder="[ADMIN PHONE]" />
          </Field>
          <Field label="Admin Email">
            <Input value={adminForm?.admin_email ?? ''} onChange={(e) => { setAdminForm({ ...adminForm!, admin_email: e.target.value }); setDirty(true) }} placeholder="[ADMIN EMAIL]" />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-0 flex items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty || saving}
          onClick={() => {
            setForm({ ...form })
            setDirty(false)
            toast('Changes cancelled.')
          }}
        >
          Cancel Changes
        </Button>
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}

function Divider() {
  return <div className="hidden h-10 w-px bg-slate-100 sm:block" />
}

function Hint({ text }: { text?: string }) {
  if (!text) return null
  return <p className="mt-1 text-xs text-slate-400">{text}</p>
}

/* ------------------------------------------------------------- Security */

function SecurityTab() {
  const { toast } = useToast()
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)

  const changePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (newPw.length < 8) {
      toast('Password must be at least 8 characters', 'error')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw new Error(relError(error))
      void oldPw
      toast('Password updated.')
      setOldPw('')
      setNewPw('')
    } catch (err) {
      toast(relError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const items = [
    ['HTTPS', 'All traffic is encrypted. Every request to your data uses a secure connection.'],
    ['Authentication', 'Sign-in is handled by Supabase Auth with securely hashed passwords. No passwords are stored in the app code or database.'],
    ['Role-based access', 'Only two roles exist: Admin (everything) and Teacher (only their own batches, classes and attendance).'],
    ['Row Level Security', 'Every table has database-level policies. A teacher querying the API directly cannot read other teachers\u2019 batches, attendance, or any fee/payment data. Hiding menus is not how access is controlled.'],
    ['No public registration', 'There is no "Create Account" anywhere. Only the Admin creates teacher logins.'],
    ['Data protection', 'Student data, parent phone numbers and financial records are only visible to the Admin (and, for attendance purposes, the student\u2019s own teacher).'],
  ]

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Security protections</h2>
        <div className="space-y-2.5">
          {items.map(([t, d]) => (
            <div key={t} className="rounded-lg border border-slate-100 p-3">
              <p className="text-sm font-semibold text-slate-800">{t}</p>
              <p className="text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Security reduces risk; independent backups protect against data loss. No system is "100% secure" — keep your
          backups current and your login private.
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Change your password</h2>
        <p className="mb-3 text-xs text-slate-500">You must be signed in. Passwords are managed by the authentication provider.</p>
        <form onSubmit={changePassword} className="max-w-sm space-y-3">
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
          </Field>
          <Field label="New password">
            <Input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button>
        </form>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- Account */

function AccountTab() {
  const { session, logout } = useAuth()
  const { toast } = useToast()
  const [email, setEmail] = useState(session?.user.email ?? '')
  const [busy, setBusy] = useState(false)

  const updateEmail = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ email })
      if (error) throw new Error(relError(error))
      toast('Email update requested. Check the new mailbox to confirm.')
    } catch (err) {
      toast(relError(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Admin account</h2>
        <p className="mb-3 text-xs text-slate-500">
          This account is yours. It is the only Admin in the system and the only account that can create teacher logins.
        </p>
        <form onSubmit={updateEmail} className="max-w-sm space-y-3">
          <Field label="Login email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" disabled={busy}>{busy ? 'Updating…' : 'Update email'}</Button>
        </form>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Button variant="danger" onClick={logout}>Sign out</Button>
        </div>
      </Card>
      <Card>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Operator notes</h2>
        <p className="text-sm text-slate-600">
          If you ever lose this account, recreate it with:{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">npm run create-admin</code> — the full recovery
          guide is in <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">RECOVERY_GUIDE.md</code>.
        </p>
      </Card>
    </div>
  )
}