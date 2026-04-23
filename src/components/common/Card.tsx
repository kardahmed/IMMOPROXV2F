import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Add subtle hover shadow elevation */
  hoverable?: boolean
  /** Remove default padding (useful for lists/tables inside cards) */
  noPadding?: boolean
}

export function Card({ className, hoverable, noPadding, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-immo-border-default bg-immo-bg-card',
        !noPadding && 'p-5',
        hoverable && 'transition-shadow duration-200 hover:shadow-md',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-immo-border-default px-5 py-4', className)}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-immo-text-primary">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-immo-text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
