import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

interface PlanUsage {
  agents: number
  projects: number
  units: number
  clients: number
}

interface PlanLimits {
  plan: string
  max_agents: number
  max_projects: number
  max_units: number
  max_clients: number
  max_storage_mb: number
  features: Record<string, boolean>
  price_monthly: number
}

export function usePlanEnforcement() {
  const tenantId = useAuthStore(s => s.tenantId)

  const { data } = useQuery({
    queryKey: ['plan-enforcement', tenantId],
    queryFn: async () => {
      if (!tenantId) return null

      // Get tenant plan
      const { data: tenant } = await supabase.from('tenants').select('plan').eq('id', tenantId).single()
      const plan = (tenant as { plan: string } | null)?.plan ?? 'free'

      // Get plan limits
      const { data: limits } = await supabase.from('plan_limits').select('*').eq('plan', plan).single()

      // Get current usage
      const [agents, projects, units, clients] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('role', ['agent', 'admin']),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('units').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      ])

      const usage: PlanUsage = {
        agents: agents.count ?? 0,
        projects: projects.count ?? 0,
        units: units.count ?? 0,
        clients: clients.count ?? 0,
      }

      const l = (limits as unknown as PlanLimits) ?? { max_agents: 2, max_projects: 1, max_units: 20, max_clients: 50, max_storage_mb: 100, features: {}, price_monthly: 0, plan: 'free' }

      return {
        plan,
        limits: l,
        usage,
        canAddAgent: usage.agents < l.max_agents,
        canAddProject: usage.projects < l.max_projects,
        canAddUnit: usage.units < l.max_units,
        canAddClient: usage.clients < l.max_clients,
        hasFeature: (feature: string) => l.features?.[feature] === true,
        isLimitReached: (type: 'agents' | 'projects' | 'units' | 'clients') => {
          const map = { agents: l.max_agents, projects: l.max_projects, units: l.max_units, clients: l.max_clients }
          return usage[type] >= map[type]
        },
      }
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  })

  return data ?? {
    plan: 'free',
    limits: { max_agents: 2, max_projects: 1, max_units: 20, max_clients: 50, max_storage_mb: 100, features: {}, price_monthly: 0, plan: 'free' },
    usage: { agents: 0, projects: 0, units: 0, clients: 0 },
    canAddAgent: true,
    canAddProject: true,
    canAddUnit: true,
    canAddClient: true,
    hasFeature: () => false,
    isLimitReached: () => false,
  }
}
