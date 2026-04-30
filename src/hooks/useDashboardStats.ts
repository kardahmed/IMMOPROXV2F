import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { useSuperAdminStore } from '@/store/superAdminStore'
import { PIPELINE_ORDER } from '@/lib/constants'

interface ProjectProgress {
  id: string
  name: string
  code: string
  status: string
  total: number
  sold: number
  reserved: number
  available: number
  blocked: number
}

interface RecentActivity {
  id: string
  type: string
  title: string
  client_name: string
  agent_name: string
  created_at: string
}

interface AgentPerformance {
  id: string
  first_name: string
  last_name: string
  reservations_count: number
  sales_count: number
  revenue: number
  last_activity: string | null
}

interface PipelineFunnel {
  stage: string
  count: number
  percentage: number
}

interface AtRiskClient {
  id: string
  full_name: string
  phone: string
  pipeline_stage: string
  last_contact_at: string | null
  days_without_contact: number
  agent_name: string
}

interface TodayVisit {
  id: string
  scheduled_at: string
  client_name: string
  agent_name: string
  project_name: string
  status: string
}

interface SourceBreakdown {
  source: string
  count: number
}

export interface DashboardStats {
  activeProjects: number
  totalUnits: number
  soldUnits: number
  reservedUnits: number
  revenue: number
  saleRate: number
  totalClients: number
  overduePayments: number
  overdueAmount: number
  projectProgress: ProjectProgress[]
  recentActivity: RecentActivity[]
  agentPerformance: AgentPerformance[]
  pipelineFunnel: PipelineFunnel[]
  atRiskClients: AtRiskClient[]
  todayVisits: TodayVisit[]
  sourceBreakdown: SourceBreakdown[]
  monthlyRevenue: Array<{ month: string; revenue: number }>
  todayTasks: number
  overdueTasks: number
}

interface UnitRow { id: string; status: string; project_id: string; agent_id: string | null }
interface SaleRow { final_price: number; agent_id: string; created_at: string }
interface ProjectRow { id: string; name: string; code: string; status: string }
interface AgentRow { id: string; first_name: string; last_name: string; last_activity: string | null }
interface ReservationRow { agent_id: string }
interface HistoryRow { id: string; type: string; title: string; created_at: string; clients: { full_name: string } | null; users: { first_name: string; last_name: string } | null }

// Single source of truth — was duplicated as a local array, kept in
// sync manually with src/types/index.ts (PIPELINE_STAGES Record) and
// SegmentBuilder. Now reads PIPELINE_ORDER from lib/constants.
const PIPELINE_STAGES = PIPELINE_ORDER

export function useDashboardStats() {
  const { tenantId: authTenantId, role, session } = useAuthStore()
  const { inspectedTenantId } = useSuperAdminStore()
  const userId = session?.user?.id
  const isAgent = role === 'agent'
  const tenantId = role === 'super_admin' ? inspectedTenantId : authTenantId

  return useQuery({
    queryKey: ['dashboard-stats', tenantId, role, userId],
    queryFn: async (): Promise<DashboardStats> => {
      if (!tenantId) throw new Error('No tenant')

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const today = now.toISOString().split('T')[0]
      const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000).toISOString()

      const [
        projectsRes, unitsRes, salesRes, historyRes, agentsRes,
        agentReservationsRes, agentSalesRes,
        clientsRes, overdueRes, visitsRes, tasksRes, allSalesRes,
      ] = await Promise.all([
        supabase.from('projects').select('id, name, code, status').eq('tenant_id', tenantId).eq('status', 'active'),
        supabase.from('units').select('id, status, project_id, agent_id').eq('tenant_id', tenantId),
        (() => {
          let q = supabase.from('sales').select('final_price, agent_id, created_at').eq('tenant_id', tenantId).eq('status', 'active')
          if (isAgent && userId) q = q.eq('agent_id', userId)
          return q
        })(),
        supabase.from('history').select('id, type, title, created_at, clients(full_name), users!history_agent_id_fkey(first_name, last_name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
        isAgent ? Promise.resolve({ data: [], error: null }) : supabase.from('users').select('id, first_name, last_name, last_activity').eq('tenant_id', tenantId).eq('role', 'agent').eq('status', 'active'),
        isAgent ? Promise.resolve({ data: [], error: null }) : supabase.from('reservations').select('agent_id').eq('tenant_id', tenantId).eq('status', 'active').gte('created_at', monthStart),
        isAgent ? Promise.resolve({ data: [], error: null }) : supabase.from('sales').select('agent_id, final_price').eq('tenant_id', tenantId).eq('status', 'active').gte('created_at', monthStart),
        // New: clients for pipeline funnel + at-risk
        supabase.from('clients').select('id, full_name, phone, pipeline_stage, last_contact_at, source, agent_id, users!clients_agent_id_fkey(first_name, last_name)').eq('tenant_id', tenantId),
        // New: overdue payments
        supabase.from('payment_schedules').select('amount').eq('tenant_id', tenantId).eq('status', 'late'),
        // New: today's visits
        supabase.from('visits').select('id, scheduled_at, status, clients(full_name), users!visits_agent_id_fkey(first_name, last_name), projects(name)').eq('tenant_id', tenantId).gte('scheduled_at', today).lte('scheduled_at', today + 'T23:59:59').order('scheduled_at'),
        // New: tasks (post-028 unified — status is always 'pending' for
        // both pending+scheduled, scheduled_at distinguishes them)
        supabase.from('tasks').select('id, status, scheduled_at').eq('tenant_id', tenantId).eq('status', 'pending').is('deleted_at', null),
        // New: all sales for monthly chart
        supabase.from('sales').select('final_price, created_at').eq('tenant_id', tenantId).eq('status', 'active').gte('created_at', new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()),
      ])

      for (const res of [projectsRes, unitsRes, salesRes, historyRes, agentsRes, agentReservationsRes, agentSalesRes, clientsRes]) {
        if (res.error) { handleSupabaseError(res.error); throw res.error }
      }

      const projects = (projectsRes.data ?? []) as unknown as ProjectRow[]
      const units = (unitsRes.data ?? []) as unknown as UnitRow[]
      const sales = (salesRes.data ?? []) as unknown as SaleRow[]
      const historyRaw = (historyRes.data ?? []) as unknown as HistoryRow[]
      const agents = (agentsRes.data ?? []) as unknown as AgentRow[]
      const monthReservations = (agentReservationsRes.data ?? []) as unknown as ReservationRow[]
      const monthSales = (agentSalesRes.data ?? []) as unknown as SaleRow[]
      const clients = (clientsRes.data ?? []) as Array<Record<string, unknown>>
      const overduePayments = (overdueRes.data ?? []) as Array<{ amount: number }>
      const todayVisitsRaw = (visitsRes.data ?? []) as Array<Record<string, unknown>>
      const tasksRaw = (tasksRes.data ?? []) as Array<{ id: string; status: string; scheduled_at: string | null }>
      const allSalesRaw = (allSalesRes.data ?? []) as unknown as SaleRow[]

      const filteredUnits = isAgent && userId ? units.filter(u => u.agent_id === userId) : units

      // KPIs
      const totalUnits = filteredUnits.length
      const soldUnits = filteredUnits.filter(u => u.status === 'sold').length
      const reservedUnits = filteredUnits.filter(u => u.status === 'reserved').length
      const revenue = sales.reduce((sum, s) => sum + (s.final_price ?? 0), 0)
      const saleRate = totalUnits > 0 ? ((soldUnits + reservedUnits) / totalUnits) * 100 : 0

      // Project progress
      const projectProgress: ProjectProgress[] = projects.map(p => {
        const pUnits = units.filter(u => u.project_id === p.id)
        return {
          id: p.id, name: p.name, code: p.code, status: p.status, total: pUnits.length,
          sold: pUnits.filter(u => u.status === 'sold').length,
          reserved: pUnits.filter(u => u.status === 'reserved').length,
          available: pUnits.filter(u => u.status === 'available').length,
          blocked: pUnits.filter(u => u.status === 'blocked').length,
        }
      })

      // Recent activity
      const recentActivity: RecentActivity[] = historyRaw.map(h => ({
        id: h.id, type: h.type, title: h.title,
        client_name: h.clients?.full_name ?? '-',
        agent_name: h.users ? `${h.users.first_name} ${h.users.last_name}` : '-',
        created_at: h.created_at,
      }))

      // Agent performance
      const agentPerformance: AgentPerformance[] = agents.map(a => ({
        id: a.id, first_name: a.first_name, last_name: a.last_name,
        reservations_count: monthReservations.filter(r => r.agent_id === a.id).length,
        sales_count: monthSales.filter(s => s.agent_id === a.id).length,
        revenue: monthSales.filter(s => s.agent_id === a.id).reduce((sum, s) => sum + (s.final_price ?? 0), 0),
        last_activity: a.last_activity,
      }))

      // Pipeline funnel
      const totalClients = clients.length
      const pipelineFunnel: PipelineFunnel[] = PIPELINE_STAGES.map(stage => {
        const count = clients.filter(c => c.pipeline_stage === stage).length
        return { stage, count, percentage: totalClients > 0 ? (count / totalClients) * 100 : 0 }
      })

      // At-risk clients (5+ days without contact, not in vente/perdue)
      const atRiskClients: AtRiskClient[] = clients
        .filter(c => {
          const stage = c.pipeline_stage as string
          if (['vente', 'perdue'].includes(stage)) return false
          const lastContact = c.last_contact_at as string | null
          if (!lastContact) return true
          return new Date(lastContact) < new Date(fiveDaysAgo)
        })
        .map(c => {
          const agent = c.users as { first_name: string; last_name: string } | null
          const lastContact = c.last_contact_at as string | null
          const days = lastContact ? Math.floor((now.getTime() - new Date(lastContact).getTime()) / 86400000) : 999
          return {
            id: c.id as string, full_name: c.full_name as string, phone: c.phone as string,
            pipeline_stage: c.pipeline_stage as string, last_contact_at: lastContact,
            days_without_contact: days,
            agent_name: agent ? `${agent.first_name} ${agent.last_name}` : '-',
          }
        })
        .sort((a, b) => b.days_without_contact - a.days_without_contact)
        .slice(0, 5)

      // Today's visits
      const todayVisits: TodayVisit[] = todayVisitsRaw.map(v => ({
        id: v.id as string, scheduled_at: v.scheduled_at as string, status: v.status as string,
        client_name: (v.clients as { full_name: string } | null)?.full_name ?? '-',
        agent_name: ((v.users as { first_name: string; last_name: string } | null) ? `${(v.users as { first_name: string; last_name: string }).first_name} ${(v.users as { first_name: string; last_name: string }).last_name}` : '-'),
        project_name: (v.projects as { name: string } | null)?.name ?? '-',
      }))

      // Source breakdown
      const sourceMap = new Map<string, number>()
      for (const c of clients) {
        const src = (c.source as string) ?? 'autre'
        sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1)
      }
      const sourceBreakdown: SourceBreakdown[] = [...sourceMap.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)

      // Monthly revenue (6 months)
      const monthlyRevenue: Array<{ month: string; revenue: number }> = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']
        const rev = allSalesRaw.filter(s => s.created_at.startsWith(monthKey)).reduce((sum, s) => sum + (s.final_price ?? 0), 0)
        monthlyRevenue.push({ month: monthNames[d.getMonth()], revenue: rev })
      }

      // Tasks
      const todayTasks = tasksRaw.filter(t => t.scheduled_at && t.scheduled_at.startsWith(today)).length
      const overdueTasks = tasksRaw.filter(t => t.scheduled_at && t.scheduled_at < today).length

      return {
        activeProjects: projects.length, totalUnits, soldUnits, reservedUnits, revenue, saleRate,
        totalClients, overduePayments: overduePayments.length,
        overdueAmount: overduePayments.reduce((s, p) => s + (p.amount ?? 0), 0),
        projectProgress, recentActivity, agentPerformance,
        pipelineFunnel, atRiskClients, todayVisits, sourceBreakdown, monthlyRevenue,
        todayTasks, overdueTasks,
      }
    },
    enabled: !!tenantId,
  })
}
