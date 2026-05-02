import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Search,
  Phone,
  Building2,
  Users as UsersIcon,
  Globe,
  Home,
  Megaphone,
  UserCheck,
  HelpCircle,
  GripVertical,
  Share2,
  Image,
} from 'lucide-react'
import { SOURCE_LABELS } from '@/types'
import type { ClientSource } from '@/types'
import { nameToColor } from '@/lib/avatarColor'

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  facebook_ads: Share2,
  google_ads: Search,
  instagram_ads: Image,
  appel_entrant: Phone,
  reception: Building2,
  bouche_a_oreille: UsersIcon,
  reference_client: UserCheck,
  site_web: Globe,
  portail_immobilier: Home,
  autre: Megaphone,
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export interface KanbanCardClient {
  id: string
  full_name: string
  phone: string
  source: string
  agent_name: string | null
  project_name: string | null
  created_at: string | null
  days_in_stage: number
  is_urgent: boolean
  is_priority?: boolean | null
}

interface KanbanCardProps {
  client: KanbanCardClient
  urgentDays: number
  compact?: boolean
  selected?: boolean
  onSelect?: (id: string) => void
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function KanbanCard({
  client,
  urgentDays,
  compact = false,
  selected = false,
  onSelect,
  isDragging = false,
}: KanbanCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const color = useMemo(() => nameToColor(client.full_name), [client.full_name])
  const initials = useMemo(() => getInitials(client.full_name), [client.full_name])
  const SourceIcon = SOURCE_ICONS[client.source] ?? HelpCircle
  const daysOverdue = client.days_in_stage > urgentDays

  return (
    <div
      onClick={(e) => {
        if (e.shiftKey && onSelect) { onSelect(client.id); return }
        navigate(`/pipeline/clients/${client.id}`)
      }}
      className={`group relative cursor-pointer rounded-lg border bg-immo-bg-card p-3 transition-all ${
        selected
          ? 'border-immo-accent-green ring-1 ring-immo-accent-green/30'
          : isDragging
            ? 'border-immo-accent-green/50 opacity-50 shadow-lg'
            : 'border-immo-border-default hover:border-immo-border-glow/40 hover:shadow-md hover:shadow-immo-accent-green/5'
      }`}
    >
      {/* Select checkbox (visible on hover or when selected) */}
      {onSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(client.id) }}
          className={`absolute left-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded border transition-all ${
            selected
              ? 'border-immo-accent-green bg-immo-accent-green'
              : 'border-immo-border-default opacity-0 group-hover:opacity-100'
          }`}
        >
          {selected && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>}
        </button>
      )}

      {/* Drag handle (visible on hover) */}
      <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100">
        <GripVertical className="h-3.5 w-3.5 text-immo-text-muted" />
      </div>

      {/* Row 1: Avatar + Name + Days badge */}
      <div className="mb-2 flex items-start gap-2.5">
        {/* Avatar */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: color + '25', color }}
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-immo-text-primary">
              {client.full_name}
            </p>
            {/* VIP badge */}
            {client.is_priority && (
              <span className="shrink-0 rounded bg-immo-status-orange/15 px-1.5 py-0.5 text-[8px] font-bold text-immo-status-orange">{t('pipeline_card.vip')}</span>
            )}
            {/* Urgent alert */}
            {client.is_urgent && (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-immo-status-red" />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] text-immo-text-muted">{client.phone}</p>
            <a
              href={`https://wa.me/${client.phone.replace(/[\s\-\(\)]/g, '').replace(/^0/, '213')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[#25D366] opacity-0 transition-opacity group-hover:opacity-100 hover:text-[#128C7E]"
              title={t('pipeline_card.whatsapp')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12.001 2C6.478 2 2 6.478 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.932-1.39A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.524 2 12.001 2z"/></svg>
            </a>
          </div>
        </div>

        {/* Days in stage badge */}
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
            daysOverdue
              ? 'bg-immo-status-red-bg text-immo-status-red'
              : client.days_in_stage > 3
                ? 'bg-immo-status-orange-bg text-immo-status-orange'
                : 'bg-immo-bg-card-hover text-immo-text-muted'
          }`}
        >
          {t('pipeline_card.days_short', { count: client.days_in_stage })}
        </span>
      </div>

      {/* Row 2+3: Details (hidden in compact mode) */}
      {!compact && (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 rounded bg-immo-bg-primary px-1.5 py-0.5 text-[10px] text-immo-text-secondary">
              <SourceIcon className="h-3 w-3" />
              {SOURCE_LABELS[client.source as ClientSource] ?? client.source}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-immo-text-muted">
            {client.project_name && (
              <span className="flex items-center gap-1 truncate">
                <Building2 className="h-3 w-3 shrink-0" />
                {client.project_name}
              </span>
            )}
            {client.agent_name && (
              <span className="flex items-center gap-1 truncate">
                <UsersIcon className="h-3 w-3 shrink-0" />
                {client.agent_name}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
