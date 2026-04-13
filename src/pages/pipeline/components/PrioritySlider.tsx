import { useNavigate } from 'react-router-dom'
import {
  Phone,
  MessageCircle,
  Calendar,
  Mail,
  StickyNote,
  Eye,
} from 'lucide-react'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'

interface PriorityClient {
  id: string
  full_name: string
  pipeline_stage: PipelineStage
  confirmed_budget: number | null
  last_contact_at: string | null
  created_at: string
}

interface PrioritySliderProps {
  clients: PriorityClient[]
  onAction: (clientId: string, action: string) => void
}

function daysSince(date: string | null): number {
  if (!date) return 0
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
}

export function PrioritySlider({ clients, onAction }: PrioritySliderProps) {
  const navigate = useNavigate()
  if (clients.length === 0) return null

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-immo-text-primary">
        <span className="rounded-md bg-immo-status-orange/10 px-2 py-0.5 text-[10px] font-bold text-immo-status-orange">VIP</span>
        Clients prioritaires ({clients.length})
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {clients.map((c) => {
          const stage = PIPELINE_STAGES[c.pipeline_stage]
          const daysNoContact = daysSince(c.last_contact_at)
          const daysInStage = daysSince(c.created_at)

          return (
            <div
              key={c.id}
              onClick={() => navigate(`/pipeline/clients/${c.id}`)}
              className="w-[220px] shrink-0 cursor-pointer rounded-xl border border-immo-border-default bg-immo-bg-card p-3 transition-all hover:border-immo-status-orange/40 hover:shadow-md"
            >
              {/* Header */}
              <div className="mb-2 flex items-center gap-2">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-immo-status-orange/15 text-xs font-semibold text-immo-status-orange">
                  {c.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-immo-status-orange text-[6px] font-bold text-white">V</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-immo-text-primary">{c.full_name}</p>
                  <div className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: stage?.color }} />
                    <span className="text-[10px] text-immo-text-muted">{stage?.label}</span>
                  </div>
                </div>
              </div>

              {/* Metrics */}
              <div className="mb-3 flex gap-3 text-[10px] text-immo-text-muted">
                <span>{daysInStage}j dans l'étape</span>
                <span className={daysNoContact > 3 ? 'text-immo-status-red' : ''}>
                  {daysNoContact}j sans contact
                </span>
              </div>

              {/* Quick actions */}
              <div className="flex gap-1">
                {[
                  { icon: Phone, action: 'call', title: 'Appeler' },
                  { icon: MessageCircle, action: 'whatsapp', title: 'WhatsApp' },
                  { icon: Calendar, action: 'visit', title: 'Planifier visite' },
                  { icon: Mail, action: 'email', title: 'Email' },
                  { icon: StickyNote, action: 'note', title: 'Note' },
                  { icon: Eye, action: 'view', title: 'Voir fiche' },
                ].map(({ icon: Icon, action, title }) => (
                  <button
                    key={action}
                    onClick={() => onAction(c.id, action)}
                    title={title}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-accent-green"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
