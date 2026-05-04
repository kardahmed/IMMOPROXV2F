import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import type { PipelineStage } from '@/types'

export interface PipelineAlert {
  type: 'urgent' | 'relaunch' | 'tasks'
  count: number
  // Translation key for the label rendered in AlertBar. Concrete
  // text comes from src/i18n via t(); the params are passed inline.
  i18nKey: 'pipeline_alerts.urgent' | 'pipeline_alerts.relaunch' | 'pipeline_alerts.tasks'
  i18nParams?: { count: number; days?: number }
  clientIds?: string[]
}

export interface PipelineKPIs {
  totalClients: number
  pendingVisits: number
  inNegotiation: number
  converted: number
  totalPotential: number
  negotiationValue: number
  convertedValue: number
  avgBudget: number
}

export interface StageStat {
  stage: PipelineStage
  count: number
  percentage: number
}

export function usePipelineStats() {
  const { tenantId, session, role } = useAuthStore()
  const userId = session?.user?.id
  const isAgent = role === 'agent'

  return useQuery({
    queryKey: ['pipeline-stats', tenantId, userId, role],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      // Fetch settings, clients, tasks, AND sales in parallel.
      // Sales is the source of truth for the "converted" KPI (final
      // price, after discount). Clients.confirmed_budget is the
      // declarative number entered at the start of negotiation —
      // useful as "potential pipeline value" but it should NEVER
      // appear as actual revenue in dashboards.
      const [settingsRes, clientsRes, tasksRes, salesRes] = await Promise.all([
        supabase.from('tenant_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
        (() => {
          let q = supabase.from('clients').select('id, pipeline_stage, confirmed_budget, last_contact_at, created_at, is_priority, interest_level').eq('tenant_id', tenantId)
          if (isAgent && userId) q = q.eq('agent_id', userId)
          return q
        })(),
        supabase.from('tasks').select('id').eq('tenant_id', tenantId).eq('status', 'pending')
          .then(r => isAgent && userId ? { ...r, data: r.data } : r), // RLS handles filtering
        (() => {
          let q = supabase.from('sales').select('agent_id, final_price').eq('tenant_id', tenantId).eq('status', 'active')
          if (isAgent && userId) q = q.eq('agent_id', userId)
          return q
        })(),
      ])

      const settings = settingsRes.data
      const clients = (clientsRes.data ?? []) as Array<{
        id: string; pipeline_stage: PipelineStage; confirmed_budget: number | null
        last_contact_at: string | null; created_at: string; is_priority: boolean; interest_level: string
      }>
      const pendingTasks = tasksRes.data?.length ?? 0

      if (clientsRes.error) { handleSupabaseError(clientsRes.error); throw clientsRes.error }

      const urgentDays = settings?.urgent_alert_days ?? 7
      const relaunchDays = settings?.relaunch_alert_days ?? 3
      const now = Date.now()

      // Alerts
      const urgentClients = clients.filter((c) => {
        const ref = c.last_contact_at ?? c.created_at
        return ref && (now - new Date(ref).getTime()) > urgentDays * 86400000
          && !['vente', 'perdue'].includes(c.pipeline_stage)
      })

      const relaunchClients = clients.filter((c) => {
        if (!c.last_contact_at) return false
        return (now - new Date(c.last_contact_at).getTime()) > relaunchDays * 86400000
          && !['vente', 'perdue'].includes(c.pipeline_stage)
      })

      const alerts: PipelineAlert[] = []
      if (urgentClients.length > 0) {
        alerts.push({ type: 'urgent', count: urgentClients.length, i18nKey: 'pipeline_alerts.urgent', i18nParams: { count: urgentClients.length, days: urgentDays }, clientIds: urgentClients.map(c => c.id) })
      }
      if (relaunchClients.length > 0) {
        alerts.push({ type: 'relaunch', count: relaunchClients.length, i18nKey: 'pipeline_alerts.relaunch', i18nParams: { count: relaunchClients.length, days: relaunchDays }, clientIds: relaunchClients.map(c => c.id) })
      }
      if (pendingTasks > 0) {
        alerts.push({ type: 'tasks', count: pendingTasks, i18nKey: 'pipeline_alerts.tasks', i18nParams: { count: pendingTasks } })
      }

      // KPIs
      const visitStages: PipelineStage[] = ['visite_a_gerer', 'visite_confirmee']
      const negoStages: PipelineStage[] = ['negociation', 'reservation']
      const convertedStages: PipelineStage[] = ['vente']

      const pendingVisits = clients.filter(c => visitStages.includes(c.pipeline_stage)).length
      const inNegotiation = clients.filter(c => negoStages.includes(c.pipeline_stage)).length
      const converted = clients.filter(c => convertedStages.includes(c.pipeline_stage)).length

      const withBudget = clients.filter(c => c.confirmed_budget != null)
      const totalPotential = withBudget.reduce((s, c) => s + (c.confirmed_budget ?? 0), 0)
      const negotiationValue = withBudget.filter(c => negoStages.includes(c.pipeline_stage)).reduce((s, c) => s + (c.confirmed_budget ?? 0), 0)

      // convertedValue used to also sum confirmed_budget on clients
      // in stage 'vente' / 'reservation' — that's the declared budget
      // at qualification time, NOT the actual sale price. With the
      // commercial modal flow now creating real sales rows, sum
      // sales.final_price for the truth.
      const sales = (salesRes.data ?? []) as Array<{ agent_id: string; final_price: number }>
      const convertedValue = sales.reduce((s, sale) => s + (sale.final_price ?? 0), 0)

      const avgBudget = withBudget.length > 0 ? totalPotential / withBudget.length : 0

      const kpis: PipelineKPIs = {
        totalClients: clients.length,
        pendingVisits,
        inNegotiation,
        converted,
        totalPotential,
        negotiationValue,
        convertedValue,
        avgBudget,
      }

      // Stage stats
      const allStages: PipelineStage[] = ['accueil', 'visite_a_gerer', 'visite_confirmee', 'visite_terminee', 'negociation', 'reservation', 'vente', 'relancement', 'perdue']
      const total = clients.length || 1
      const stageStats: StageStat[] = allStages.map(stage => {
        const count = clients.filter(c => c.pipeline_stage === stage).length
        return { stage, count, percentage: (count / total) * 100 }
      })

      return { alerts, kpis, stageStats }
    },
    enabled: !!tenantId,
  })
}
