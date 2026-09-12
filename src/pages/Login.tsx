import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Building2, Lock, Mail } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useProfile } from '../lib/profile'
import { Button, Input, Label, Spinner } from '../components/ui'
import { InstituteLogo } from '../components/branding'

export default function Login() {
  const { login } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    const res = await login(email.trim(), password)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    navigate(from ?? '/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-10">
        <div className="mb-6 flex flex-col items-center text-center">
          {profile?.logo_url ? (
            <InstituteLogo size={72} />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white">
              <Building2 className="h-10 w-10" />
            </div>
          )}
          <h1 className="mt-3 text-xl font-bold text-slate-900">
            {profile?.institute_name || 'Coaching Manager'}
          </h1>
          {profile?.tagline ? <p className="mt-1 text-sm text-slate-500">{profile.tagline}</p> : null}
        </div>

        <div className="card p-5">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Admin / Teacher Login</h2>
          <p className="mb-4 text-xs text-slate-500">Private access for institute staff only.</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  className="pl-9"
                  placeholder="you@institute.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="pl-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Spinner className="h-4 w-4 text-white" /> : null}
              Sign in
            </Button>
          </form>
        </div>
        <p className="mt-6 pb-8 text-center text-[11px] text-slate-400">
          Private system for {profile?.institute_name || 'this institute'}. No public registration.
        </p>
      </div>
    </div>
  )
}