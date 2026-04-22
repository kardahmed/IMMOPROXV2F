import type { ReactNode } from 'react'

const ACCENTS = {
  green: { bar: 'bg-immo-accent-green', text: 'text-immo-accent-green', iconBg: 'bg-immo-accent-green/10' },
  blue: { bar: 'bg-immo-accent-blue', text: 'text-immo-accent-blue', iconBg: 'bg-immo-accent-blue/10' },
  orange: { bar: 'bg-immo-status-orange', text: 'text-immo-status-orange', iconBg: 'bg-immo-status-orange/10' },
  red: { bar: 'bg-immo-status-red', text: 'text-immo-status-red', iconBg: 'bg-immo-status-red/10' },
} as const

interface KPICardProps {
  label: string
  value: string | number
  subtitle?: string
  accent?: keyof typeof ACCENTS
  icon?: ReactNode
}

export function KPICard({ label, value, subtitle, accent = 'green', icon }: KPICardProps) {
  const a = ACCENTS[accent]

  return (
    <div className="relative overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card shadow-sm transition-shadow duration-200 hover:shadow-md">
      {/* Accent bar */}
      <div className={`h-[3px] ${a.bar}`} />

      <div className="flex items-start justify-between p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-immo-text-muted">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-immo-text-primary">
            {value}
          </p>
          {subtitle && (
            <p className={`mt-1 text-xs font-medium ${a.text}`}>{subtitle}</p>
          )}
        </div>

        {icon && (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${a.iconBg}`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
