import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, ChevronRight, Phone, Mail,
  Users, Calendar, Bookmark, DollarSign, CheckCircle, Target,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { KPICard, PageSkeleton, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { USER_ROLE_LABELS, GOAL_METRIC_LABELS, PIPELINE_STAGES, HISTORY_TYPE_LABELS } from '@/types'
import type { UserRole, GoalMetric, GoalStatus, PipelineStage, HistoryType } from '@/types'
import { formatPriceCompact } from '@/lib/constants'
import { format, startOfMonth, endOfMonth, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { nameToColor } from '@/lib/avatarColor'

const STATUS_CONFIG: Record<GoalStatus, { label: string; type: 'blue' | 'green' | 'red' }> = {
  in_progress: { label: 'En cours', type: 'blue' },
  achieved: { label: 'Atteint', type: 'green' },
  exceeded: { label: 'Dépassé', type: 'green' },
  not_achieved: { label: 'Non atteint', type: 'red' },
}

export function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  useAuthStore() // keep store subscription active

  const now = new Date()
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd')

  // Fetch agent
  const { data: agent, isLoading } = useQuery({
    queryKey: ['agent-detail', agentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('*').eq('id', agentId!).single()
      if (error) { handleSupabaseError(error); throw error }
      return data as { id: string; first_name: string; last_name: string; email: string; phone: string | null; role: UserRole; status: string; last_activity: string | null }
    },
    enabled: !!agentId,
  })

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['agent-stats', agentId, monthStart],
    queryFn: async () => {
      const [clientsRes, visitsRes, reservationsRes, salesRes] = await Promise.all([
        supabase.from('clients').select('id').eq('agent_id', agentId!),
        supabase.from('visits').select('id').eq('agent_id', agentId!).gte('scheduled_at', monthStart).lte('scheduled_at', monthEnd),
        supabase.from('reservations').select('id').eq('agent_id', agentId!).gte('created_at', monthStart).lte('created_at', monthEnd),
        supabase.from('sales').select('id, final_price').eq('agent_id', agentId!).eq('status', 'active').gte('created_at', monthStart).lte('created_at', monthEnd),
      ])
      const salesData = (salesRes.data ?? []) as Array<{ id: string; final_price: number }>
      return {
        clients: clientsRes.data?.length ?? 0,
        visits: visitsRes.data?.length ?? 0,
        reservations: reservationsRes.data?.length ?? 0,
        sales: salesData.length,
        revenue: salesData.reduce((s, r) => s + r.final_price, 0),
      }
    },
    enabled: !!agentId,
  })

  // Fetch goals
  const { data: goals = [] } = useQuery({
    queryKey: ['agent-goals', agentId],
    queryFn: async () => {
      const { data, error } = await supabase.from('agent_goals').select('*').eq('agent_id', agentId!).order('created_at', { ascending: false }).limit(5)
      if (error) return []
      return data as unknown as Array<{ id: string; metric: GoalMetric; target_value: number; current_value: number; status: GoalStatus; started_at: string; ended_at: string }>
    },
    enabled: !!agentId,
  })

  // Fetch assigned clients
  const { data: clients = [] } = useQuery({
    queryKey: ['agent-clients', agentId],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, full_name, phone, pipeline_stage, created_at').eq('agent_id', agentId!).order('created_at', { ascending: false }).limit(20)
      return (data ?? []) as Array<{ id: string; full_name: string; phone: string; pipeline_stage: PipelineStage; created_at: string }>
    },
    enabled: !!agentId,
  })

  // Fetch history
  const { data: history = [] } = useQuery({
    queryKey: ['agent-history', agentId],
    queryFn: async () => {
      const { data } = await supabase.from('history').select('id, type, title, created_at, clients(full_name)').eq('agent_id', agentId!).order('created_at', { ascending: false }).limit(20)
      return (data ?? []) as unknown as Array<Record<string, unknown>>
    },
    enabled: !!agentId,
  })

  if (isLoading || !agent) return <PageSkeleton kpiCount={4} />

  const fullName = `${agent.first_name} ${agent.last_name}`
  const color = nameToColor(fullName)
  const initials = `${agent.first_name[0]}${agent.last_name[0]}`.toUpperCase()

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-immo-text-muted">
        <Link to="/agents" className="hover:text-immo-text-primary">Agents</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-immo-text-primary">{fullName}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-5">
        <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="mt-1 text-immo-text-muted hover:text-immo-text-primary">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold" style={{ backgroundColor: color + '20', color }}>
          {initials}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-immo-text-primary">{fullName}</h1>
            <StatusBadge label={USER_ROLE_LABELS[agent.role]} type="blue" />
            <StatusBadge label={agent.status === 'active' ? 'Actif' : 'Inactif'} type={agent.status === 'active' ? 'green' : 'red'} />
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-immo-text-muted">
            {agent.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{agent.phone}</span>}
            <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{agent.email}</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <KPICard label="Clients" value={stats?.clients ?? 0} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Visites (mois)" value={stats?.visits ?? 0} accent="blue" icon={<Calendar className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Réservations" value={stats?.reservations ?? 0} accent="orange" icon={<Bookmark className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label="Ventes" value={stats?.sales ?? 0} accent="green" icon={<CheckCircle className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="CA généré" value={formatPriceCompact(stats?.revenue ?? 0)} accent="green" icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      <Separator className="bg-immo-border-default" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Goals */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">
            <Target className="mr-1.5 inline h-4 w-4" />Objectifs en cours
          </h3>
          {goals.length === 0 ? (
            <div className="rounded-xl border border-immo-border-default bg-immo-bg-card py-8 text-center text-xs text-immo-text-muted">Aucun objectif</div>
          ) : (
            <div className="space-y-2">
              {goals.map(g => {
                const progress = g.target_value > 0 ? Math.min(Math.round((g.current_value / g.target_value) * 100), 150) : 0
                const stCfg = STATUS_CONFIG[g.status]
                return (
                  <div key={g.id} className="rounded-lg border border-immo-border-default bg-immo-bg-card p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-immo-text-primary">{GOAL_METRIC_LABELS[g.metric]}</span>
                      <StatusBadge label={stCfg.label} type={stCfg.type} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-immo-bg-primary">
                        <div className={`h-full rounded-full ${progress >= 100 ? 'bg-immo-accent-green' : progress >= 70 ? 'bg-immo-status-orange' : 'bg-immo-status-red'}`} style={{ width: `${Math.min(progress, 100)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-immo-text-primary">{progress}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Clients */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">
            <Users className="mr-1.5 inline h-4 w-4" />Clients assignés
          </h3>
          {clients.length === 0 ? (
            <div className="rounded-xl border border-immo-border-default bg-immo-bg-card py-8 text-center text-xs text-immo-text-muted">Aucun client</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-immo-border-default">
              <table className="w-full">
                <thead><tr className="bg-immo-bg-card-hover">
                  {['Nom', 'Téléphone', 'Étape'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-immo-text-muted">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-immo-border-default">
                  {clients.map(c => {
                    const stage = PIPELINE_STAGES[c.pipeline_stage]
                    return (
                      <tr key={c.id} onClick={() => navigate(`/pipeline/clients/${c.id}`)} className="cursor-pointer bg-immo-bg-card hover:bg-immo-bg-card-hover">
                        <td className="px-3 py-2 text-xs font-medium text-immo-text-primary">{c.full_name}</td>
                        <td className="px-3 py-2 text-xs text-immo-text-muted">{c.phone}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: stage.color + '20', color: stage.color }}>
                            {stage.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Separator className="bg-immo-border-default" />

      {/* History */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Historique d'activité</h3>
        {history.length === 0 ? (
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-card py-8 text-center text-xs text-immo-text-muted">Aucune activité</div>
        ) : (
          <div className="space-y-1.5">
            {history.map(h => {
              const meta = HISTORY_TYPE_LABELS[h.type as HistoryType]
              const client = h.clients as { full_name: string } | null
              return (
                <div key={h.id as string} className="flex items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-card px-4 py-2.5">
                  <div className="h-2 w-2 shrink-0 rounded-full bg-immo-accent-green" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-immo-text-primary">{meta?.label ?? (h.title as string)}</span>
                    {client && <span className="ml-2 text-[11px] text-immo-text-muted">— {client.full_name}</span>}
                  </div>
                  <span className="shrink-0 text-[11px] text-immo-text-muted">
                    {formatDistanceToNow(new Date(h.created_at as string), { addSuffix: true, locale: fr })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
