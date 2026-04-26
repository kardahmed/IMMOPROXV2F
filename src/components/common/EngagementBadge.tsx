import { Flame, Snowflake, ThermometerSun } from 'lucide-react'

interface Props {
  score: number | null | undefined
  /** Compact (table cell) vs full (with label) */
  size?: 'sm' | 'md'
  className?: string
}

interface Tier {
  color: string
  bg: string
  border: string
  label: string
  Icon: typeof Flame
}

function tierFor(score: number): Tier {
  if (score >= 60) {
    return {
      color: 'text-immo-accent-green',
      bg: 'bg-immo-accent-green/10',
      border: 'border-immo-accent-green/30',
      label: 'Chaud',
      Icon: Flame,
    }
  }
  if (score >= 30) {
    return {
      color: 'text-immo-status-orange',
      bg: 'bg-immo-status-orange/10',
      border: 'border-immo-status-orange/30',
      label: 'Tiede',
      Icon: ThermometerSun,
    }
  }
  return {
    color: 'text-immo-status-red',
    bg: 'bg-immo-status-red/10',
    border: 'border-immo-status-red/30',
    label: 'Froid',
    Icon: Snowflake,
  }
}

// Visual indicator of a client's engagement score, computed every 6h
// by the recompute-engagement Edge Function (rule-based: WhatsApp
// reply recency + visits + silence + auto-cancelled tasks). Color
// thresholds: green ≥60 (chaud), orange 30-59 (tiede), red <30 (froid).
export function EngagementBadge({ score, size = 'sm', className = '' }: Props) {
  if (score === null || score === undefined) return null

  const safeScore = Math.max(0, Math.min(100, Math.round(score)))
  const tier = tierFor(safeScore)
  const Icon = tier.Icon

  const sizeClasses =
    size === 'sm'
      ? 'h-5 px-1.5 text-[10px]'
      : 'h-7 px-2.5 text-xs'

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  return (
    <span
      title={`Engagement ${safeScore}/100 — ${tier.label}`}
      className={`inline-flex items-center gap-1 rounded-full border ${tier.border} ${tier.bg} ${tier.color} font-semibold ${sizeClasses} ${className}`}
    >
      <Icon className={iconSize} />
      <span>{safeScore}</span>
      {size === 'md' && <span className="opacity-80">· {tier.label}</span>}
    </span>
  )
}
