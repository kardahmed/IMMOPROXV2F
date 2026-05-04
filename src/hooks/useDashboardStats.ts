// Dashboard stats hook.
//
// Pre-fix this hook fired 12 separate Supabase queries on every
// dashboard mount, several of them unbounded (`select *` on
// clients/units with no .limit()). Migration 069 introduced the
// `dashboard_summary` RPC which computes every KPI / list /
// breakdown server-side in a single round-trip; this hook now just
// hands in tenant_id + (for agents) the caller's user id and gets
// back a JSONB blob shaped like DashboardStats.
//
// RLS on the underlying tables still applies per caller because
// the RPC is SECURITY INVOKER, so an agent only aggregates their
// own clients and a tenant admin only their tenant.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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

// Map raw "YYYY-MM" month_key from the SQL aggregator to the short
// french label the chart expects ("Jan", "Fev", ...). Done here so
// the SQL stays locale-agnostic.
const FR_MONTHS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']
function relabelMonths(rows: Array<{ month: string; revenue: number }>): Array<{ month: string; revenue: number }> {
  return rows.map(r => {
    const monthIdx = parseInt(r.month.slice(5, 7)) - 1
    return { month: FR_MONTHS[monthIdx] ?? r.month, revenue: r.revenue }
  })
}

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

      // RPC signature isn't in database.generated.ts yet — cast
      // through unknown so the call type-checks until types are
      // regenerated in vague 3.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: { p_tenant_id: string; p_user_id: string | null; p_is_agent: boolean },
      ) => Promise<{ data: DashboardStats | null; error: { message: string } | null }>)(
        'dashboard_summary',
        {
          p_tenant_id: tenantId,
          p_user_id: isAgent ? userId ?? null : null,
          p_is_agent: isAgent,
        },
      )
      if (error) throw new Error(error.message)
      if (!data) throw new Error('No dashboard data')

      return {
        ...data,
        // monthlyRevenue arrives as { month: 'YYYY-MM', revenue }[];
        // chart wants french month labels.
        monthlyRevenue: relabelMonths(data.monthlyRevenue ?? []),
      }
    },
    enabled: !!tenantId,
    // Stats refresh every minute on the dashboard, but this is now
    // cheap enough (one RPC) that we could go lower; keep at 60s for
    // sanity vs. live-busy bias.
    staleTime: 60_000,
  })
}
