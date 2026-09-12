import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Layers,
  ClipboardCheck,
  IndianRupee,
  BarChart3,
  Database,
  Settings,
  LogOut,
  Menu,
  X,
  CloudOff,
  Cloud,
  Home,
  History,
  User,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useProfile } from '../lib/profile'
import { InstituteLogo } from './branding'
import { cn, greeting } from '../lib/utils'
import { getQueue, useOnline } from '../lib/offline'

/* ---------------------------------------------------------------- header */

function TopBar({
  title,
  onOpenNav,
  right,
}: {
  title: ReactNode
  onOpenNav?: () => void
  right?: ReactNode
}) {
  const { profile } = useProfile()
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      {onOpenNav ? (
        <button onClick={onOpenNav} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
      ) : null}
      <InstituteLogo size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-slate-900">
          {profile?.short_name && profile.short_name !== '[SHORT NAME]' ? profile.short_name : 'Coaching Manager'}
        </div>
        <div className="truncate text-xs text-slate-500">{title}</div>
      </div>
      {right}
    </header>
  )
}

function OnlineBanner() {
  const online = useOnline()
  const queue = getQueue()
  const offlineQueue = queue.length
  if (online) {
    if (offlineQueue === 0) return null
    return (
      <div className="flex items-center gap-2 bg-sky-100 px-4 py-2 text-xs font-medium text-sky-800">
        <Cloud className="h-4 w-4 shrink-0" />
        {offlineQueue} attendance record{offlineQueue > 1 ? 's' : ''} waiting to sync. Internet is back — syncing…
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-xs font-medium text-amber-800">
      <CloudOff className="h-4 w-4 shrink-0" />
      You are offline. Marked attendance will be saved and synced automatically when you reconnect.
    </div>
  )
}

/* ---------------------------------------------------------------- nav helpers */

interface NavEntry {
  to: string
  label: string
  icon: ReactNode
}

const ADMIN_NAV: NavEntry[] = [
  { to: '/app/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { to: '/app/students', label: 'Students', icon: <Users className="h-5 w-5" /> },
  { to: '/app/teachers', label: 'Teachers', icon: <GraduationCap className="h-5 w-5" /> },
  { to: '/app/batches', label: 'Batches', icon: <Layers className="h-5 w-5" /> },
  { to: '/app/attendance', label: 'Attendance', icon: <ClipboardCheck className="h-5 w-5" /> },
  { to: '/app/fees', label: 'Fees', icon: <IndianRupee className="h-5 w-5" /> },
  { to: '/app/reports', label: 'Reports', icon: <BarChart3 className="h-5 w-5" /> },
  { to: '/app/data', label: 'Data', icon: <Database className="h-5 w-5" /> },
  { to: '/app/settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
]

const TEACHER_NAV: NavEntry[] = [
  { to: '/teacher/home', label: 'Home', icon: <Home className="h-5 w-5" /> },
  { to: '/teacher/classes', label: 'Classes', icon: <Layers className="h-5 w-5" /> },
  { to: '/teacher/attendance', label: 'Attendance', icon: <ClipboardCheck className="h-5 w-5" /> },
  { to: '/teacher/profile', label: 'Profile', icon: <User className="h-5 w-5" /> },
]

function LogoutButton() {
  const { logout } = useAuth()
  return (
    <button
      onClick={logout}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-red-50 hover:text-red-600"
    >
      <LogOut className="h-5 w-5" />
      Logout
    </button>
  )
}

function NavList({ items, onNavigate }: { items: NavEntry[]; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )
          }
        >
          {n.icon}
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

/* ---------------------------------------------------------------- admin layout */

export function AdminLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const { teacher, admin, role } = useAuth()
  const loc = useLocation()
  const name = role === 'admin' ? admin?.admin_name : teacher?.name
  useEffect(() => {
    setNavOpen(false)
  }, [loc])

  const greetingText = useMemo(() => {
    const base = greeting()
    return name && name !== '[ADMIN NAME]' ? `${base}, ${name.split(' ')[0]}` : base
  }, [name])

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-100 px-4 py-4">
            <InstituteLogo size={40} />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <NavList items={ADMIN_NAV} />
          </div>
          <div className="border-t border-slate-100 p-3">
            <div className="mb-2 px-3 text-sm font-medium text-slate-700">
              Admin · {name ?? ''}
            </div>
            <LogoutButton />
          </div>
        </aside>

        {/* Mobile drawer */}
        {navOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setNavOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <InstituteLogo size={32} />
                <button onClick={() => setNavOpen(false)} className="rounded-lg p-1 text-slate-400">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-3">
                <NavList items={ADMIN_NAV} onNavigate={() => setNavOpen(false)} />
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <LogoutButton />
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {/* Main */}
        <div className="min-w-0 flex-1">
          <TopBar
            title={greetingText}
            onOpenNav={() => setNavOpen(true)}
            right={<Menu className="h-5 w-5 text-slate-400 lg:hidden" />}
          />
          <main className="mx-auto max-w-6xl p-4 pb-16 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- teacher layout */

export function TeacherLayout() {
  const { teacher } = useAuth()
  const firstName = teacher?.name?.split(' ')[0] ?? ''
  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <InstituteLogo size={34} />
            <div>
              <div className="text-sm font-bold text-slate-900">
                {greeting()}
                {firstName ? `, ${firstName}` : ''}
              </div>
              <div className="text-xs text-slate-500">{teacher?.subject ?? 'Teacher'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/teacher/profile">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {firstName?.[0]?.toUpperCase() ?? 'T'}
              </div>
            </Link>
          </div>
        </div>
      </header>
      <OnlineBanner />
      <main className="px-3 pb-24 pt-3">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TEACHER_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                  isActive ? 'text-brand-600' : 'text-slate-400'
                )
              }
            >
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}