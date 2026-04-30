import { useQuery } from '@tanstack/react-query'
import { Phone, MessageCircle, Mail, Calendar, Clock, TrendingUp, Users, ArrowRight, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'
import { KPICard, LoadingSpinner } from '@/components/common'

const STAGES_ORDER: PipelineStage[] = ['accueil', 'visite_a_gerer', 'visite_confirmee', 'visite_terminee', 'negociation', 'reservation', 'vente', 'relancement', 'perdue']

interface StageStats {
  stage: PipelineStage
  label: string
  color: string
  clients: number
  avgDays: number
  calls: number
  whatsapp: number
  sms: number
  emails: number
  visits: number
  totalInteractions: number
  noActivity: number
  conversionRate: number
}

export function PipelineAnalytics() {
  const tenantId = useAuthStore(s => s.tenantId)

  const { data, isLoading } = useQuery({
    queryKey: ['pipeline-analytics', tenantId],
    queryFn: async () => {
      const [clientsRes, historyRes, visitsRes] = await Promise.all([
        supabase.from('clients').select('id, pipeline_stage, created_at, last_contact_at').eq('tenant_id', tenantId!),
        supabase.from('history').select('client_id, type, created_at, metadata').eq('tenant_id', tenantId!),
        supabase.from('visits').select('client_id, status').eq('tenant_id', tenantId!),
      ])

      const clients = (clientsRes.data ?? []) as Array<{ id: string; pipeline_stage: string; created_at: string; last_contact_at: string | null }>
      const history = (historyRes.data ?? []) as Array<{ client_id: string; type: string; created_at: string; metadata: Record<string, unknown> | null }>
      const visits = (visitsRes.data ?? []) as Array<{ client_id: string; status: string }>

      const now = Date.now()
      const fiveDaysAgo = now - 5 * 86400000

      // Audit (HIGH): proper conversion rate via stage_change history.
      // The previous version counted clients CURRENTLY past the stage,
      // missing those who passed through and were later lost — which
      // strongly under-estimated early-stage conversion. We now build
      // a "did this client ever reach stage X?" set per stage.
      const everReached: Record<string, Set<string>> = {}
      for (const stage of STAGES_ORDER) everReached[stage] = new Set<string>()
      // Seed: every client who is currently AT or PAST a stage has
      // reached it.
      for (const c of clients) {
        const idx = STAGES_ORDER.indexOf(c.pipeline_stage as PipelineStage)
        for (let i = 0; i <= idx; i++) {
          everReached[STAGES_ORDER[i]].add(c.id)
        }
      }
      // Then layer history.stage_change events: if the metadata
      // contains the previous stage, we know the client also passed
      // through it (even if they're now back somewhere else, e.g.
      // 'perdue').
      for (const h of history) {
        if (h.type !== 'stage_change') continue
        const meta = h.metadata ?? {}
        const fromStage = (meta as { from?: string }).from
        const toStage = (meta as { to?: string }).to
        if (fromStage && STAGES_ORDER.includes(fromStage as PipelineStage)) {
          everReached[fromStage].add(h.client_id)
        }
        if (toStage && STAGES_ORDER.includes(toStage as PipelineStage)) {
          everReached[toStage].add(h.client_id)
        }
      }

      const stats: StageStats[] = STAGES_ORDER.map((stage, idx) => {
        const stageInfo = PIPELINE_STAGES[stage]
        const stageClients = clients.filter(c => c.pipeline_stage === stage)
        const clientIds = new Set(stageClients.map(c => c.id))
        const stageHistory = history.filter(h => clientIds.has(h.client_id))

        // Avg days in stage (from created_at, approximation)
        const totalDays = stageClients.reduce((sum, c) => {
          const days = Math.floor((now - new Date(c.created_at).getTime()) / 86400000)
          return sum + days
        }, 0)
        const avgDays = stageClients.length > 0 ? Math.round(totalDays / stageClients.length) : 0

        // Interaction counts
        const calls = stageHistory.filter(h => ['call', 'whatsapp_call'].includes(h.type)).length
        const whatsapp = stageHistory.filter(h => h.type === 'whatsapp_message').length
        const sms = stageHistory.filter(h => h.type === 'sms').length
        const emails = stageHistory.filter(h => h.type === 'email').length
        const stageVisits = visits.filter(v => clientIds.has(v.client_id)).length
        const totalInteractions = stageHistory.length

        // No activity (5+ days)
        const noActivity = stageClients.filter(c => {
          if (!c.last_contact_at) return true
          return new Date(c.last_contact_at).getTime() < fiveDaysAgo
        }).length

        // Real conversion rate: of all clients who EVER reached this
        // stage, how many also reached the next stage? Uses the
        // everReached map built above so we count clients who later
        // bounced (e.g. 'perdue').
        const nextStage = STAGES_ORDER[idx + 1]
        let conversionRate = 0
        if (nextStage && idx < STAGES_ORDER.length - 1) {
          const here = everReached[stage].size
          const next = everReached[nextStage].size
          conversionRate = here > 0 ? (next / here) * 100 : 0
        }

        return {
          stage, label: stageInfo.label, color: stageInfo.color,
          clients: stageClients.length, avgDays, calls, whatsapp, sms, emails,
          visits: stageVisits, totalInteractions, noActivity, conversionRate,
        }
      })

      // Global totals
      const totalClients = clients.length
      const totalCalls = history.filter(h => ['call', 'whatsapp_call'].includes(h.type)).length
      const totalMessages = history.filter(h => ['whatsapp_message', 'sms', 'email'].includes(h.type)).length
      const totalVisits = visits.length
      const avgConversion = stats.filter(s => s.conversionRate > 0).reduce((s, st) => s + st.conversionRate, 0) / Math.max(1, stats.filter(s => s.conversionRate > 0).length)

      return { stats, totalClients, totalCalls, totalMessages, totalVisits, avgConversion }
    },
    enabled: !!tenantId,
  })

  if (isLoading || !data) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      {/* Global KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPICard label="Total clients" value={data.totalClients} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Appels total" value={data.totalCalls} accent="green" icon={<Phone className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="Messages total" value={data.totalMessages} accent="blue" icon={<MessageCircle className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Visites total" value={data.totalVisits} accent="orange" icon={<Calendar className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label="Taux conversion moy." value={`${data.avgConversion.toFixed(0)}%`} accent={data.avgConversion > 50 ? 'green' : 'orange'} icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      {/* Stage detail table */}
      <div className="overflow-hidden rounded-xl border border-immo-border-default">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-immo-bg-card-hover">
                {['Etape', 'Clients', 'Duree moy.', 'Appels', 'WhatsApp', 'SMS', 'Emails', 'Visites', 'Total interactions', 'Sans activite', 'Conversion'].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-immo-border-default">
              {data.stats.map(s => (
                <tr key={s.stage} className="bg-immo-bg-card hover:bg-immo-bg-card-hover transition-colors">
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-sm font-medium text-immo-text-primary">{s.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: s.color + '15', color: s.color }}>
                      {s.clients}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-xs text-immo-text-secondary">
                      <Clock className="h-3 w-3" /> {s.avgDays}j
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`flex items-center gap-1 text-xs ${s.calls > 0 ? 'text-immo-accent-blue font-medium' : 'text-immo-text-muted'}`}>
                      <Phone className="h-3 w-3" /> {s.calls}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`flex items-center gap-1 text-xs ${s.whatsapp > 0 ? 'text-green-500 font-medium' : 'text-immo-text-muted'}`}>
                      <MessageCircle className="h-3 w-3" /> {s.whatsapp}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`flex items-center gap-1 text-xs ${s.sms > 0 ? 'text-immo-status-orange font-medium' : 'text-immo-text-muted'}`}>
                      <Mail className="h-3 w-3" /> {s.sms}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`flex items-center gap-1 text-xs ${s.emails > 0 ? 'text-immo-accent-blue font-medium' : 'text-immo-text-muted'}`}>
                      <Mail className="h-3 w-3" /> {s.emails}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`flex items-center gap-1 text-xs ${s.visits > 0 ? 'text-immo-status-orange font-medium' : 'text-immo-text-muted'}`}>
                      <Calendar className="h-3 w-3" /> {s.visits}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-bold ${s.totalInteractions > 0 ? 'text-immo-text-primary' : 'text-immo-text-muted'}`}>
                      {s.totalInteractions}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {s.noActivity > 0 ? (
                      <div className="flex items-center gap-1 text-xs font-medium text-immo-status-red">
                        <AlertTriangle className="h-3 w-3" /> {s.noActivity}
                      </div>
                    ) : (
                      <span className="text-xs text-immo-accent-green">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.stage !== 'vente' && s.stage !== 'perdue' && s.stage !== 'relancement' ? (
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-immo-bg-primary">
                          <div className="h-full rounded-full bg-immo-accent-green" style={{ width: `${Math.min(s.conversionRate, 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-semibold text-immo-text-secondary">{s.conversionRate.toFixed(0)}%</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-immo-text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Conversion funnel visual */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">Entonnoir de conversion</h3>
        <div className="flex items-end gap-1" style={{ height: 180 }}>
          {data.stats.filter(s => !['relancement', 'perdue'].includes(s.stage)).map((s, i, arr) => {
            const maxClients = Math.max(...arr.map(x => x.clients), 1)
            const height = (s.clients / maxClients) * 160
            return (
              <div key={s.stage} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold text-immo-text-primary">{s.clients}</span>
                <div className="w-full rounded-t-md transition-all" style={{ height: Math.max(height, 4), backgroundColor: s.color, opacity: 0.8 }} />
                <span className="text-[8px] text-immo-text-muted text-center leading-tight">{s.label}</span>
                {i < arr.length - 1 && s.conversionRate > 0 && (
                  <div className="absolute" style={{ marginTop: -20 }}>
                    <ArrowRight className="h-3 w-3 text-immo-text-muted" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
