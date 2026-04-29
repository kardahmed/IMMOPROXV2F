import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X, Phone, Mail, Flame, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { PIPELINE_STAGES, SOURCE_LABELS } from '@/types'
import type { Client, ClientSource, PipelineStage } from '@/types'
import { formatPrice } from '@/lib/constants'
import { nameToColor } from '@/lib/avatarColor'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface ClientSidePanelProps {
  clientId: string | null
  onClose: () => void
}


export function ClientSidePanel({ clientId, onClose }: ClientSidePanelProps) {
  const navigate = useNavigate()

  const { data: client } = useQuery({
    queryKey: ['client-sidepanel', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, users!clients_agent_id_fkey(first_name, last_name)')
        .eq('id', clientId!)
        .single()
      if (error) { handleSupabaseError(error); throw error }
      return data as Client & { users: { first_name: string; last_name: string } | null }
    },
    enabled: !!clientId,
  })

  // Recent history
  const { data: history = [] } = useQuery({
    queryKey: ['client-sidepanel-history', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('history')
        .select('id, type, title, created_at')
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
        .limit(5)
      return (data ?? []) as Array<{ id: string; type: string; title: string; created_at: string }>
    },
    enabled: !!clientId,
  })

  if (!clientId) return null
  if (!client) return (
    <div className="fixed inset-y-0 right-0 z-40 w-[400px] border-l border-immo-border-default bg-immo-bg-card shadow-xl">
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" />
      </div>
    </div>
  )

  const stage = PIPELINE_STAGES[client.pipeline_stage as PipelineStage]
  const agentName = client.users ? `${client.users.first_name} ${client.users.last_name}` : null
  const color = nameToColor(client.full_name)
  const initials = client.full_name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const isHot = client.interest_level === 'high' && (client.confirmed_budget ?? 0) > 0
  const waLink = `https://wa.me/${client.phone.replace(/[\s\-\(\)]/g, '').replace(/^0/, '213')}`

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[400px] flex-col border-l border-immo-border-default bg-immo-bg-card shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-immo-border-default px-5 py-4">
        <h3 className="text-sm font-semibold text-immo-text-primary">Apercu client</h3>
        <button onClick={onClose} aria-label="Fermer l'apercu" className="rounded-md p-1 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Client info */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5">
          {/* Avatar + name */}
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold" style={{ backgroundColor: color + '20', color }}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-immo-text-primary">{client.full_name}</h2>
                {isHot && <Flame className="h-4 w-4 text-immo-status-red" />}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: stage?.color + '15', color: stage?.color }}>
                  {stage?.label}
                </span>
                <StatusBadge label={SOURCE_LABELS[client.source as ClientSource] ?? client.source} type="muted" />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="mb-4 space-y-2 rounded-lg border border-immo-border-default p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-immo-text-primary">
                <Phone className="h-3.5 w-3.5 text-immo-text-muted" />
                {client.phone}
              </div>
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="text-[#25D366] hover:text-[#128C7E]" title="WhatsApp">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12.001 2C6.478 2 2 6.478 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.932-1.39A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.524 2 12.001 2z"/></svg>
              </a>
            </div>
            {client.email && (
              <div className="flex items-center gap-2 text-sm text-immo-text-primary">
                <Mail className="h-3.5 w-3.5 text-immo-text-muted" />
                {client.email}
              </div>
            )}
          </div>

          {/* Key metrics */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-immo-border-default p-3">
              <p className="text-[10px] font-medium text-immo-text-muted">Budget</p>
              <p className="text-sm font-bold text-immo-text-primary">
                {client.confirmed_budget ? formatPrice(client.confirmed_budget) : '-'}
              </p>
            </div>
            <div className="rounded-lg border border-immo-border-default p-3">
              <p className="text-[10px] font-medium text-immo-text-muted">Agent</p>
              <p className="text-sm font-bold text-immo-text-primary">{agentName ?? '-'}</p>
            </div>
          </div>

          {/* Recent activity */}
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-semibold text-immo-text-muted">Activite recente</h4>
            {history.length === 0 ? (
              <p className="text-xs text-immo-text-muted">Aucune activite</p>
            ) : (
              <div className="space-y-1.5">
                {history.map(h => (
                  <div key={h.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
                    <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-immo-accent-green" />
                    <span className="flex-1 truncate text-immo-text-primary">{h.title}</span>
                    <span className="shrink-0 text-immo-text-muted">
                      {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: fr })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="border-t border-immo-border-default p-4">
        <Button
          onClick={() => { navigate(`/pipeline/clients/${clientId}`); onClose() }}
          className="w-full bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90"
        >
          <ExternalLink className="mr-1.5 h-4 w-4" /> Voir la fiche complete
        </Button>
      </div>
    </div>
  )
}
