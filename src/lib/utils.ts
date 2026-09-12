import { clsx, type ClassValue } from 'clsx'

export const INSTITUTE_TZ = 'Asia/Kolkata'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: INSTITUTE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function nowLocal(): Date {
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: INSTITUTE_TZ }))
  } catch {
    return new Date()
  }
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthFirst(iso: string): string {
  if (!iso) return ''
  return iso.slice(0, 7) + '-01'
}

export function monthLabel(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.slice(0, 10) + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return '—'
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  )
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function formatINR(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '₹0'
  return inr.format(n)
}

export function num(n: number | null | undefined | string, fallback = 0): number {
  const v = typeof n === 'string' ? parseFloat(n) : n
  return v === null || v === undefined || isNaN(v) ? fallback : v
}

export function greeting(): string {
  const h = nowLocal().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function dayName(day: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] ?? ''
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 400)
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s: string
  if (typeof value === 'object') {
    try {
      s = JSON.stringify(value)
    } catch {
      s = String(value)
    }
  } else {
    s = String(value)
  }
  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function toCSV(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const head = cols.map(csvEscape).join(',')
  const body = rows
    .map((r) => cols.map((c) => csvEscape(r[c])).join(','))
    .join('\r\n')
  return '\uFEFF' + head + '\r\n' + body
}

export function statusStyle(status: string): string {
  const map: Record<string, string> = {
    PRESENT: 'bg-green-100 text-green-700',
    ABSENT: 'bg-red-100 text-red-700',
    LATE: 'bg-amber-100 text-amber-700',
    LEAVE: 'bg-sky-100 text-sky-700',
    PAID: 'bg-green-100 text-green-700',
    PARTIAL: 'bg-amber-100 text-amber-700',
    PENDING: 'bg-slate-100 text-slate-600',
    OVERDUE: 'bg-red-100 text-red-700',
    ACTIVE: 'bg-green-100 text-green-700',
    INACTIVE: 'bg-slate-100 text-slate-600',
    COMPLETED: 'bg-blue-100 text-blue-700',
    SCHEDULED: 'bg-blue-100 text-blue-700',
    CANCELLED: 'bg-red-100 text-red-700',
    REMOVED: 'bg-slate-100 text-slate-600',
  }
  return map[status] ?? 'bg-slate-100 text-slate-600'
}

export function relError(err: unknown): string {
  if (!err) return 'Unknown error'
  const e = err as { message?: string; error_description?: string }
  return e.message ?? e.error_description ?? String(err)
}

export function pick<T extends object>(obj: T, keys: (keyof T)[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) out[k as string] = obj[k]
  return out
}