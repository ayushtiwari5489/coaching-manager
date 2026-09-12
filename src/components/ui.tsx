import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { X, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

/* ---------------------------------------------------------------- Buttons */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }

export function Button({ variant = 'primary', className, ...props }: BtnProps) {
  const base = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  }[variant]
  return <button className={cn(base, className)} {...props} />
}

/* ---------------------------------------------------------------- Form */

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <label className={cn('label', className)}>{children}</label>
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('input', props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('input', 'min-h-[80px]', props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn('input', 'cursor-pointer', props.className)} />
}

export function Field({
  label,
  children,
  required,
  className,
}: {
  label: string
  children: ReactNode
  required?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      <Label>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------- Card */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card p-4', className)}>{children}</div>
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'default',
  sub,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'green' | 'red' | 'amber' | 'blue'
  sub?: ReactNode
}) {
  const tones: Record<string, string> = {
    default: 'bg-slate-100 text-slate-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
  }
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
        </div>
        {icon ? <div className={cn('rounded-lg p-2', tones[tone])}>{icon}</div> : null}
      </div>
    </div>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        {
          slate: 'bg-slate-100 text-slate-600',
          green: 'bg-green-100 text-green-700',
          red: 'bg-red-100 text-red-700',
          amber: 'bg-amber-100 text-amber-700',
          blue: 'bg-blue-100 text-blue-700',
        }[tone] ?? 'bg-slate-100 text-slate-600'
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-12 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- Table */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('card overflow-x-auto', className)}>
      <table className="w-full min-w-[520px] text-left">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn('th', className)}>{children}</th>
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('td', className)}>{children}</td>
}

/* ---------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', widths[size])}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message: string
  confirmLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
                onClose()
              }
            }}
          >
            {busy ? <Spinner className="h-4 w-4 text-white" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Toast */

interface ToastItem {
  id: number
  kind: 'success' | 'error' | 'info'
  text: string
}

const ToastCtx = createContext<{ toast: (text: string, kind?: ToastItem['kind']) => void }>({
  toast: () => {},
})

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const toast = (text: string, kind: ToastItem['kind'] = 'success') => {
    const id = Date.now() + Math.random()
    setItems((p) => [...p, { id, kind, text }])
    setTimeout(() => setItems((p) => p.filter((i) => i.id !== id)), 3800)
  }
  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    error: <AlertTriangle className="h-4 w-4 text-red-500" />,
    info: <Info className="h-4 w-4 text-blue-500" />,
  }
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-3">
        {items.map((i) => (
          <div
            key={i.id}
            className="pointer-events-auto flex max-w-md items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
          >
            <span className="mt-0.5 shrink-0">{icons[i.kind]}</span>
            <span className="text-sm text-slate-700">{i.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}