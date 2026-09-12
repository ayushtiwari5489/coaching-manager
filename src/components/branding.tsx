import { useProfile } from '../lib/profile'
import { cn } from '../lib/utils'
import { Building2 } from 'lucide-react'

export function InstituteLogo({ className, size = 40 }: { className?: string; size?: number }) {
  const { profile } = useProfile()
  const url = profile?.logo_url
  if (url) {
    return (
      <img
        src={url}
        alt="Institute logo"
        style={{ width: size, height: size }}
        className={cn('rounded-full object-contain', className)}
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size }}
      className={cn('flex items-center justify-center rounded-full bg-brand-600 text-white', className)}
    >
      <Building2 style={{ width: size * 0.55, height: size * 0.55 }} />
    </div>
  )
}

export function InstituteName({ className }: { className?: string }) {
  const { profile } = useProfile()
  const name = profile?.institute_name || 'Coaching Manager'
  return <span className={className}>{name}</span>
}

export function BrandBlock({
  variant = 'center',
  showTagline = true,
  size = 48,
}: {
  variant?: 'center' | 'left'
  showTagline?: boolean
  size?: number
}) {
  const { profile } = useProfile()
  return (
    <div className={cn('flex items-center gap-3', variant === 'center' && 'flex-col text-center')}>
      <InstituteLogo size={size} />
      <div>
        <div className="text-lg font-bold text-slate-900">{profile?.institute_name || 'Coaching Manager'}</div>
        {showTagline && profile?.tagline ? (
          <div className="text-xs text-slate-500">{profile.tagline}</div>
        ) : null}
      </div>
    </div>
  )
}