import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { useSuperAdminStore } from '@/store/superAdminStore'

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

export interface DashboardStats {
  activeProjects: number
  totalUnits: number
  soldUnits: number
  reservedUnits: number
  revenue: number
  saleRate: number
  projectProgress: ProjectProgress[]
  recentActivity: RecentActivity[]
  agentPerformance: AgentPerformance[]
}

interface UnitRow { id: string; status: string; project_id: string; agent_id: string | null }
interface SaleRow { final_price: number; agent_id: string }
interface ProjectRow { id: string; name: string; code: string; status: string }
interface AgentRow { id: string; first_name: string; last_name: string; last_activity: string | null }
interface ReservationRow { agent_id: string }
interface HistoryRow { id: string; type: string; title: string; created_at: string; clients: { full_name: string } | null; users: { first_name: string; last_name: string } | null }

export function useDashboardStats() {
  const { tenantId: authTenantId, role, session } = useAuthStore()
  const { inspectedTenantId } = useSuperAdminStore()
  const userId = session?.user?.id
  const isAgent = role === 'agent'

  // Super admin in inspection mode: use inspectedTenantId
  const tenantId = role === 'super_admin' ? inspectedTenantId : authTenantId

  return useQuery({
    queryKey: ['dashboard-stats', tenantId, role, userId],
    queryFn: async (): Promise<DashboardStats> => {
      if (!tenantId) throw new Error('No tenant')

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [
        projectsRes,
        unitsRes,
        salesRes,
        historyRes,
        agentsRes,
        agentReservationsRes,
        agentSalesRes,
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('id, name, code, status')
          .eq('tenant_id', tenantId)
          .eq('status', 'active'),

        supabase
          .from('units')
          .select('id, status, project_id, agent_id')
          .eq('tenant_id', tenantId),

        (() => {
          let q = supabase
            .from('sales')
            .select('final_price, agent_id')
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
          if (isAgent && userId) q = q.eq('agent_id', userId)
          return q
        })(),

        supabase
          .from('history')
          .select('id, type, title, created_at, clients(full_name), users!history_agent_id_fkey(first_name, last_name)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(10),

        isAgent
          ? Promise.resolve({ data: [] as AgentRow[], error: null })
          : supabase
              .from('users')
              .select('id, first_name, last_name, last_activity')
              .eq('tenant_id', tenantId)
              .eq('role', 'agent')
              .eq('status', 'active'),

        isAgent
          ? Promise.resolve({ data: [] as ReservationRow[], error: null })
          : supabase
              .from('reservations')
              .select('agent_id')
              .eq('tenant_id', tenantId)
              .eq('status', 'active')
              .gte('created_at', monthStart),

        isAgent
          ? Promise.resolve({ data: [] as SaleRow[], error: null })
          : supabase
              .from('sales')
              .select('agent_id, final_price')
              .eq('tenant_id', tenantId)
              .eq('status', 'active')
              .gte('created_at', monthStart),
      ])

      for (const res of [projectsRes, unitsRes, salesRes, historyRes, agentsRes, agentReservationsRes, agentSalesRes]) {
        if (res.error) { handleSupabaseError(res.error); throw res.error }
      }

      const projects = (projectsRes.data ?? []) as unknown as ProjectRow[]
      const units = (unitsRes.data ?? []) as unknown as UnitRow[]
      const sales = (salesRes.data ?? []) as unknown as SaleRow[]
      const historyRaw = (historyRes.data ?? []) as unknown as HistoryRow[]
      const agents = (agentsRes.data ?? []) as unknown as AgentRow[]
      const monthReservations = (agentReservationsRes.data ?? []) as unknown as ReservationRow[]
      const monthSales = (agentSalesRes.data ?? []) as unknown as SaleRow[]

      // Filter units for agent
      const filteredUnits = isAgent && userId
        ? units.filter((u) => u.agent_id === userId)
        : units

      // KPIs
      const totalUnits = filteredUnits.length
      const soldUnits = filteredUnits.filter((u) => u.status === 'sold').length
      const reservedUnits = filteredUnits.filter((u) => u.status === 'reserved').length
      const revenue = sales.reduce((sum, s) => sum + (s.final_price ?? 0), 0)
      const saleRate = totalUnits > 0 ? ((soldUnits + reservedUnits) / totalUnits) * 100 : 0

      // Project progress
      const projectProgress: ProjectProgress[] = projects.map((p) => {
        const pUnits = units.filter((u) => u.project_id === p.id)
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          status: p.status,
          total: pUnits.length,
          sold: pUnits.filter((u) => u.status === 'sold').length,
          reserved: pUnits.filter((u) => u.status === 'reserved').length,
          available: pUnits.filter((u) => u.status === 'available').length,
          blocked: pUnits.filter((u) => u.status === 'blocked').length,
        }
      })

      // Recent activity
      const recentActivity: RecentActivity[] = historyRaw.map((h) => ({
        id: h.id,
        type: h.type,
        title: h.title,
        client_name: h.clients?.full_name ?? '-',
        agent_name: h.users ? `${h.users.first_name} ${h.users.last_name}` : '-',
        created_at: h.created_at,
      }))

      // Agent performance
      const agentPerformance: AgentPerformance[] = agents.map((a) => {
        const resCount = monthReservations.filter((r) => r.agent_id === a.id).length
        const agentMonthSales = monthSales.filter((s) => s.agent_id === a.id)
        return {
          id: a.id,
          first_name: a.first_name,
          last_name: a.last_name,
          reservations_count: resCount,
          sales_count: agentMonthSales.length,
          revenue: agentMonthSales.reduce((sum, s) => sum + (s.final_price ?? 0), 0),
          last_activity: a.last_activity,
        }
      })

      return {
        activeProjects: projects.length,
        totalUnits,
        soldUnits,
        reservedUnits,
        revenue,
        saleRate,
        projectProgress,
        recentActivity,
        agentPerformance,
      }
    },
    enabled: !!tenantId,
  })
}
