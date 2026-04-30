import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Download, CheckCircle, Bookmark, DollarSign,
  TrendingUp, Activity, ChevronLeft, ChevronRight,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard, FilterDropdown, PageSkeleton, PageHeader,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { HISTORY_TYPE_LABELS } from '@/types'
import { exportToCsv } from '@/lib/exportCsv'
import type { HistoryType } from '@/types'
// import { formatPriceCompact } from '@/lib/constants'
import {
  format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek,
} from 'date-fns'
import { fr } from 'date-fns/locale'

/* ═══ Types ═══ */

type PeriodKey = 'week' | 'month' | 'quarter' | 'year'

interface HistoryEntry {
  id: string
  type: string
  title: string
  agent_id: string | null
  client_id: string
  created_at: string
  client_name: string
  project_name: string | null
  description: string | null
}

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'quarter', label: 'Ce trimestre' },
  { key: 'year', label: 'Cette année' },
]

const ACTION_TYPES: { key: string; label: string }[] = [
  { key: 'call', label: 'Appels' },
  { key: 'whatsapp_call', label: 'Appels WA' },
  { key: 'whatsapp_message', label: 'Messages WA' },
  { key: 'sms', label: 'SMS' },
  { key: 'email', label: 'Emails' },
  { key: 'visit_planned', label: 'Visites plan.' },
  { key: 'visit_completed', label: 'Visites eff.' },
  { key: 'reservation', label: 'Réservations' },
  { key: 'sale', label: 'Ventes' },
]

function getPeriodRange(key: PeriodKey) {
  const now = new Date()
  switch (key) {
    case 'week': return { start: startOfWeek(now, { locale: fr }), end: endOfWeek(now, { locale: fr }) }
    case 'month': return { start: startOfMonth(now), end: endOfMonth(now) }
    case 'quarter': return { start: startOfQuarter(now), end: endOfQuarter(now) }
    case 'year': return { start: startOfYear(now), end: endOfYear(now) }
  }
}

const PAGE_SIZE = 25

/* ═══ Component ═══ */

export function ReportsPage() {
  const navigate = useNavigate()
  const { tenantId } = useAuthStore()
  const userId = useAuthStore((s) => s.session?.user?.id)
  const { isAgent } = usePermissions()

  const [period, setPeriod] = useState<PeriodKey>('month')
  const [agentFilter, setAgentFilter] = useState('all')
  const [view, setView] = useState<'team' | 'agent'>('team')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [detailPage, setDetailPage] = useState(0)

  const range = getPeriodRange(period)
  const rangeStart = format(range.start, "yyyy-MM-dd'T'HH:mm:ss")
  const rangeEnd = format(range.end, "yyyy-MM-dd'T'HH:mm:ss")

  // Fetch agents
  const { data: agents = [] } = useQuery({
    queryKey: ['report-agents', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name, last_activity, status').eq('tenant_id', tenantId!).in('role', ['agent', 'admin']).order('first_name')
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string; last_activity: string | null; status: string }>
    },
    enabled: !!tenantId,
  })

  // Fetch all history for period
  const { data: allHistory = [], isLoading } = useQuery({
    queryKey: ['report-history', tenantId, rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('history')
        .select('id, type, title, description, agent_id, client_id, created_at, clients(full_name)')
        .eq('tenant_id', tenantId!)
        .gte('created_at', rangeStart)
        .lte('created_at', rangeEnd)
        .order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return (data ?? []).map((h: Record<string, unknown>) => ({
        id: h.id as string,
        type: h.type as string,
        title: h.title as string,
        description: typeof h.description === 'string' ? h.description : null,
        agent_id: h.agent_id as string | null,
        client_id: h.client_id as string,
        created_at: h.created_at as string,
        client_name: (h.clients as { full_name: string } | null)?.full_name ?? '-',
        project_name: null,
      })) satisfies HistoryEntry[]
    },
    enabled: !!tenantId,
  })

  // Fetch new clients count per agent
  const { data: newClientsMap = new Map<string, number>() } = useQuery({
    queryKey: ['report-new-clients', tenantId, rangeStart, rangeEnd],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('agent_id').eq('tenant_id', tenantId!).gte('created_at', rangeStart).lte('created_at', rangeEnd)
      const m = new Map<string, number>()
      for (const c of (data ?? []) as Array<{ agent_id: string | null }>) {
        if (c.agent_id) m.set(c.agent_id, (m.get(c.agent_id) ?? 0) + 1)
      }
      return m
    },
    enabled: !!tenantId,
  })


  // Team view data
  const teamData = useMemo(() => {
    let filteredAgents = isAgent && userId ? agents.filter(a => a.id === userId) : agents
    // Audit (HIGH): le FilterDropdown "Agent" était relié à
    // setAgentFilter mais agentFilter n'était jamais utilisé dans la
    // query/teamData → le filtre ne filtrait rien.
    if (agentFilter !== 'all') {
      filteredAgents = filteredAgents.filter(a => a.id === agentFilter)
    }

    return filteredAgents.map(a => {
      const agentHistory = allHistory.filter(h => h.agent_id === a.id)
      const countType = (type: string) => agentHistory.filter(h => h.type === type).length
      const inactiveDays = a.last_activity ? Math.floor((Date.now() - new Date(a.last_activity).getTime()) / 86400000) : 999

      return {
        id: a.id,
        name: `${a.first_name} ${a.last_name}`,
        status: a.status,
        last_activity: a.last_activity,
        inactive_long: inactiveDays > 7,
        call: countType('call'),
        whatsapp_call: countType('whatsapp_call'),
        whatsapp_message: countType('whatsapp_message'),
        sms: countType('sms'),
        email: countType('email'),
        visit_planned: countType('visit_planned'),
        visit_completed: countType('visit_completed'),
        reservation: countType('reservation'),
        sale: countType('sale'),
        new_clients: newClientsMap.get(a.id) ?? 0,
      }
    })
  }, [agents, allHistory, newClientsMap, isAgent, userId, agentFilter])

  // Team totals
  const totals = useMemo(() => {
    const t: Record<string, number> = {}
    for (const key of ['call', 'whatsapp_call', 'whatsapp_message', 'sms', 'email', 'visit_planned', 'visit_completed', 'reservation', 'sale', 'new_clients']) {
      t[key] = teamData.reduce((s, a) => s + (a as unknown as Record<string, number>)[key], 0)
    }
    return t
  }, [teamData])

  // Agent view data
  const agentHistory = useMemo(() => {
    if (!selectedAgent) return []
    return allHistory.filter(h => h.agent_id === selectedAgent)
  }, [allHistory, selectedAgent])

  const agentKPIs = useMemo(() => {
    const total = agentHistory.length
    const visits = agentHistory.filter(h => h.type === 'visit_completed').length
    const reservations = agentHistory.filter(h => h.type === 'reservation').length
    const sales = agentHistory.filter(h => h.type === 'sale').length
    const nc = newClientsMap.get(selectedAgent) ?? 0
    return {
      total,
      visits,
      visitRate: nc > 0 ? Math.round((visits / nc) * 100) : 0,
      reservations,
      sales,
      conversionRate: nc > 0 ? Math.round((sales / nc) * 100) : 0,
    }
  }, [agentHistory, selectedAgent, newClientsMap])

  // Chart data
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: range.start, end: range.end })
    return days.map(day => {
      const dayEntries = agentHistory.filter(h => isSameDay(new Date(h.created_at), day))
      return {
        date: format(day, 'dd/MM'),
        appels: dayEntries.filter(h => ['call', 'whatsapp_call'].includes(h.type)).length,
        visites: dayEntries.filter(h => ['visit_planned', 'visit_completed', 'visit_confirmed'].includes(h.type)).length,
        messages: dayEntries.filter(h => ['whatsapp_message', 'sms', 'email'].includes(h.type)).length,
      }
    })
  }, [agentHistory, range])

  // Detail table pagination
  const detailEntries = agentHistory
  const detailTotalPages = Math.ceil(detailEntries.length / PAGE_SIZE)
  const detailPaged = detailEntries.slice(detailPage * PAGE_SIZE, (detailPage + 1) * PAGE_SIZE)

  // Filter options
  const agentOptions = [{ value: 'all', label: 'Tous les agents' }, ...agents.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]
  const periodOptions = PERIODS.map(p => ({ value: p.key, label: p.label }))

  if (isLoading) return <PageSkeleton kpiCount={5} />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rapports d'activité"
        subtitle="Vue par équipe ou par agent — appels, visites, ventes, conversion"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterDropdown label="Période" options={periodOptions} value={period} onChange={(v) => setPeriod(v as PeriodKey)} />
        {!isAgent && <FilterDropdown label="Agent" options={agentOptions} value={agentFilter} onChange={setAgentFilter} />}
        <Button variant="ghost" size="sm" onClick={() => exportToCsv('rapports', allHistory, [
          { header: 'Date', value: r => r.created_at },
          { header: 'Type', value: r => HISTORY_TYPE_LABELS[r.type as HistoryType]?.label ?? r.type },
          { header: 'Titre', value: r => r.title },
          { header: 'Client', value: r => r.client_name },
          { header: 'Description', value: r => r.description },
        ])} className="border border-immo-border-default text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover">
          <Download className="mr-1 h-3.5 w-3.5" /> Exporter
        </Button>

        <div className="ml-auto flex gap-1 rounded-lg border border-immo-border-default p-0.5">
          <button onClick={() => setView('team')} className={`rounded-md px-3 py-1 text-[11px] font-medium ${view === 'team' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'}`}>
            Équipe
          </button>
          <button onClick={() => { setView('agent'); if (!selectedAgent && agents.length) setSelectedAgent(agents[0].id) }} className={`rounded-md px-3 py-1 text-[11px] font-medium ${view === 'agent' ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'}`}>
            Agent
          </button>
        </div>
      </div>

      {/* TEAM VIEW */}
      {view === 'team' && (
        <div className="overflow-hidden rounded-xl border border-immo-border-default">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-immo-bg-card-hover">
                  <th className="sticky left-0 z-10 whitespace-nowrap bg-immo-bg-card-hover px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">Agent</th>
                  {ACTION_TYPES.map(t => (
                    <th key={t.key} className="whitespace-nowrap px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">{t.label}</th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">Nvx clients</th>
                  <th className="whitespace-nowrap px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">Dern. act.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-immo-border-default">
                {teamData.map(a => (
                  <tr key={a.id} className={`bg-immo-bg-card transition-colors hover:bg-immo-bg-card-hover ${a.inactive_long ? 'bg-immo-status-red-bg/20' : ''}`}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-immo-bg-card px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-immo-text-primary">{a.name}</span>
                        {a.inactive_long && <span className="h-2 w-2 rounded-full bg-immo-status-red" title="Inactif 7+ jours" />}
                      </div>
                    </td>
                    {/* Audit (HIGH): `|| '-'` masque les vrais 0 — un
                        agent à 0 actions affichait "-", indistinguable
                        d'une donnée manquante. Préciser la sémantique
                        en n'affichant '-' que si la valeur est nulle. */}
                    {ACTION_TYPES.map(t => {
                      const v = (a as unknown as Record<string, number | null | undefined>)[t.key]
                      return (
                        <td key={t.key} className="whitespace-nowrap px-3 py-2.5 text-center text-xs text-immo-text-primary">
                          {v == null ? <span className="text-immo-text-muted">-</span> : v}
                        </td>
                      )
                    })}
                    <td className="whitespace-nowrap px-3 py-2.5 text-center text-xs text-immo-text-primary">
                      {a.new_clients == null ? <span className="text-immo-text-muted">-</span> : a.new_clients}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-center">
                      <span className={`text-[11px] ${a.inactive_long ? 'font-medium text-immo-status-red' : 'text-immo-text-muted'}`}>
                        {a.last_activity ? format(new Date(a.last_activity), 'dd/MM HH:mm') : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-immo-bg-card-hover font-semibold">
                  <td className="sticky left-0 z-10 bg-immo-bg-card-hover px-4 py-2.5 text-xs text-immo-accent-green">TOTAL</td>
                  {ACTION_TYPES.map(t => (
                    <td key={t.key} className="px-3 py-2.5 text-center text-xs text-immo-accent-green">{totals[t.key] || '-'}</td>
                  ))}
                  <td className="px-3 py-2.5 text-center text-xs text-immo-accent-green">{totals.new_clients || '-'}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AGENT VIEW */}
      {view === 'agent' && (
        <div className="space-y-5">
          {/* Agent selector */}
          <FilterDropdown
            label="Agent"
            options={agents.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))}
            value={selectedAgent}
            onChange={(v) => { setSelectedAgent(v); setDetailPage(0) }}
          />

          {selectedAgent && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <KPICard label="Interactions" value={agentKPIs.total} accent="blue" icon={<Activity className="h-4 w-4 text-immo-accent-blue" />} />
                <KPICard label="Visites eff." value={agentKPIs.visits} accent="blue" icon={<CheckCircle className="h-4 w-4 text-immo-accent-blue" />} />
                <KPICard label="Taux visite" value={`${agentKPIs.visitRate}%`} accent={agentKPIs.visitRate > 30 ? 'green' : 'orange'} icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
                <KPICard label="Réservations" value={agentKPIs.reservations} accent="orange" icon={<Bookmark className="h-4 w-4 text-immo-status-orange" />} />
                <KPICard label="Ventes" value={agentKPIs.sales} accent="green" icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />} />
                <KPICard label="Taux conversion" value={`${agentKPIs.conversionRate}%`} accent={agentKPIs.conversionRate > 15 ? 'green' : 'red'} icon={<TrendingUp className="h-4 w-4 text-immo-accent-green" />} />
              </div>

              {/* Chart */}
              <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">Activité par jour</h3>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E325A" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#7F96B7' }} stroke="#1E325A" />
                      <YAxis tick={{ fontSize: 10, fill: '#7F96B7' }} stroke="#1E325A" />
                      <Tooltip contentStyle={{ background: '#0F1830', border: '1px solid #1E325A', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#EDF4FC' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="appels" stroke="#3782FF" strokeWidth={2} dot={false} name="Appels" />
                      <Line type="monotone" dataKey="visites" stroke="#00D4A0" strokeWidth={2} dot={false} name="Visites" />
                      <Line type="monotone" dataKey="messages" stroke="#FF9A1E" strokeWidth={2} dot={false} name="Messages" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Detail table */}
              <div className="overflow-hidden rounded-xl border border-immo-border-default">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-immo-bg-card-hover">
                        {['Date', 'Type', 'Client', 'Note'].map(h => (
                          <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-immo-border-default">
                      {detailPaged.map(h => {
                        const meta = HISTORY_TYPE_LABELS[h.type as HistoryType]
                        return (
                          <tr key={h.id} className="bg-immo-bg-card hover:bg-immo-bg-card-hover">
                            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-immo-text-muted">{format(new Date(h.created_at), 'dd/MM/yyyy HH:mm')}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-immo-text-secondary">{meta?.label ?? h.type}</td>
                            <td className="whitespace-nowrap px-4 py-2.5">
                              <button onClick={() => navigate(`/pipeline/clients/${h.client_id}`)} className="text-xs text-immo-accent-blue hover:underline">
                                {h.client_name}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-immo-text-muted">{h.description ?? h.title}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {detailTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-immo-border-default bg-immo-bg-card-hover px-4 py-2.5">
                    <span className="text-xs text-immo-text-muted">
                      {detailPage * PAGE_SIZE + 1}–{Math.min((detailPage + 1) * PAGE_SIZE, detailEntries.length)} sur {detailEntries.length}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" disabled={detailPage === 0} onClick={() => setDetailPage(p => p - 1)} className="h-7 w-7 p-0 text-immo-text-muted disabled:opacity-30">
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={detailPage >= detailTotalPages - 1} onClick={() => setDetailPage(p => p + 1)} className="h-7 w-7 p-0 text-immo-text-muted disabled:opacity-30">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
