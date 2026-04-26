import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, UserCheck, Briefcase, Plus, Search, Eye, LogIn, AlertTriangle, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { DataTable, KPICard, PageHeader, PageSkeleton } from '@/components/common'
import type { Column } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useSuperAdminStore } from '@/store/superAdminStore'
import { CreateTenantModal } from './components/CreateTenantModal'
import { DeleteTenantModal } from './components/DeleteTenantModal'
import { RealtimeDashboard } from './components/RealtimeDashboard'
import { PlanBadge } from './components/PlanBadge'
import { useTenantHealth } from './hooks/useTenantHealth'
import type { HealthStatus } from './hooks/useTenantHealth'

interface TenantRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  wilaya: string | null
  plan: string
  created_at: string
  agents_count: number
  clients_count: number
  projects_count: number
  units_count: number
}

const PLAN_FILTER_OPTIONS = ['all', 'free', 'starter', 'pro', 'enterprise'] as const
type PlanFilter = typeof PLAN_FILTER_OPTIONS[number]

const PLAN_FILTER_LABELS: Record<PlanFilter, string> = {
  all: 'Tous',
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const PLAN_FILTER_COLORS: Record<PlanFilter, string> = {
  all: '#7C3AED',
  free: '#8898AA',
  starter: '#0579DA',
  pro: '#7C3AED',
  enterprise: '#F5A623',
}

export function TenantsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [tenantToDelete, setTenantToDelete] = useState<{ id: string; name: string } | null>(null)
  const { enterTenant } = useSuperAdminStore()

  // Fetch all tenants with counts (excluding soft-deleted)
  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ['super-admin-tenants'],
    queryFn: async () => {
      const { data: rawTenants, error } = await supabase
        .from('tenants')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (error) { handleSupabaseError(error); throw error }
      if (!rawTenants) return []

      // Fetch counts in bulk (4 queries total instead of 4 × N)
      const [allAgents, allClients, allProjects, allUnits] = await Promise.all([
        supabase.from('users').select('tenant_id').eq('role', 'agent'),
        supabase.from('clients').select('tenant_id'),
        supabase.from('projects').select('tenant_id'),
        supabase.from('units').select('tenant_id'),
      ])

      // Build count maps
      const countByTenant = (rows: Array<{ tenant_id: string }> | null) => {
        const map = new Map<string, number>()
        for (const r of rows ?? []) map.set(r.tenant_id, (map.get(r.tenant_id) ?? 0) + 1)
        return map
      }
      const agentCounts = countByTenant((allAgents.data ?? []) as Array<{ tenant_id: string }>)
      const clientCounts = countByTenant((allClients.data ?? []) as Array<{ tenant_id: string }>)
      const projectCounts = countByTenant((allProjects.data ?? []) as Array<{ tenant_id: string }>)
      const unitCounts = countByTenant((allUnits.data ?? []) as Array<{ tenant_id: string }>)

      return rawTenants.map((t: Record<string, unknown>): TenantRow => ({
        id: t.id as string,
        name: t.name as string,
        email: t.email as string | null,
        phone: t.phone as string | null,
        wilaya: t.wilaya as string | null,
        plan: (t.plan as string) ?? 'free',
        created_at: t.created_at as string,
        agents_count: agentCounts.get(t.id as string) ?? 0,
        clients_count: clientCounts.get(t.id as string) ?? 0,
        projects_count: projectCounts.get(t.id as string) ?? 0,
        units_count: unitCounts.get(t.id as string) ?? 0,
      }))
    },
  })

  // Health data
  const { data: healthData } = useTenantHealth()
  const healthMap = new Map(healthData?.tenants.map(h => [h.tenant_id, h]) ?? [])

  // KPIs
  const totalTenants = tenants.length
  const activeTenants = tenants.filter(t => t.agents_count > 0).length
  const totalUsers = tenants.reduce((s, t) => s + t.agents_count, 0)
  const totalClients = tenants.reduce((s, t) => s + t.clients_count, 0)
  const criticalCount = healthData?.critical_count ?? 0

  // Per-plan tenant counts (for the filter chips)
  const countByPlan = tenants.reduce<Record<string, number>>((acc, t) => {
    acc[t.plan] = (acc[t.plan] ?? 0) + 1
    return acc
  }, {})

  // Filter
  const filtered = tenants.filter(t => {
    if (planFilter !== 'all' && t.plan !== planFilter) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.email?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function handleAccessTenant(tenant: TenantRow) {
    enterTenant(tenant.id, tenant.name)
    navigate('/dashboard')
  }

  if (isLoading) return <PageSkeleton kpiCount={5} hasTable />

  const columns: Column<TenantRow>[] = [
    { key: 'name', header: 'Nom', render: (t) => <span className="text-sm font-medium text-immo-text-primary">{t.name}</span> },
    { key: 'plan', header: 'Plan', render: (t) => <PlanBadge plan={t.plan} /> },
    { key: 'sante', header: 'Sante', render: (t) => <HealthBadge status={healthMap.get(t.id)?.status ?? 'healthy'} issues={healthMap.get(t.id)?.issues ?? []} /> },
    { key: 'email', header: 'Email', render: (t) => <span className="text-xs text-immo-text-secondary">{t.email ?? '-'}</span> },
    { key: 'agents', header: 'Agents', align: 'center', render: (t) => <span className="text-sm text-immo-text-primary">{t.agents_count}</span> },
    { key: 'clients', header: 'Clients', align: 'center', render: (t) => <span className="text-sm text-immo-text-primary">{t.clients_count}</span> },
    { key: 'projects', header: 'Projets', align: 'center', render: (t) => <span className="text-sm text-immo-text-primary">{t.projects_count}</span> },
    { key: 'units', header: 'Biens', align: 'center', render: (t) => <span className="text-sm text-immo-text-primary">{t.units_count}</span> },
    { key: 'created', header: 'Cree le', render: (t) => <span className="text-xs text-immo-text-secondary">{new Date(t.created_at).toLocaleDateString('fr')}</span> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (t) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/admin/tenants/${t.id}`) }}
            aria-label={`Voir ${t.name}`}
            title="Voir"
            className="rounded-md p-1.5 text-immo-text-secondary transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleAccessTenant(t) }}
            aria-label={`Acceder au tenant ${t.name}`}
            title="Acceder"
            className="rounded-md p-1.5 text-[#7C3AED] transition-colors hover:bg-[#7C3AED]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
          >
            <LogIn className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setTenantToDelete({ id: t.id, name: t.name }) }}
            aria-label={`Supprimer ${t.name}`}
            title="Supprimer"
            className="rounded-md p-1.5 text-immo-text-muted transition-colors hover:bg-immo-status-red/10 hover:text-immo-status-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-status-red/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Realtime dashboard */}
      <RealtimeDashboard />

      <PageHeader
        title="Gestion des Tenants"
        subtitle="Gerez les agences de la plateforme"
        actions={
          <Button
            onClick={() => setShowCreate(true)}
            variant="purple"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Nouveau Tenant
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <KPICard label="Total Tenants" value={totalTenants} accent="blue" icon={<Building2 className="h-5 w-5 text-[#7C3AED]" />} />
        <KPICard label="Tenants actifs" value={activeTenants} accent="green" icon={<UserCheck className="h-5 w-5 text-immo-accent-green" />} />
        <KPICard label="Total Utilisateurs" value={totalUsers} accent="blue" icon={<Users className="h-5 w-5 text-immo-accent-blue" />} />
        <KPICard label="Total Clients" value={totalClients} accent="orange" icon={<Briefcase className="h-5 w-5 text-immo-status-orange" />} />
        <KPICard label="Alertes critiques" value={criticalCount} accent={criticalCount > 0 ? 'red' : 'green'} icon={<AlertTriangle className={`h-5 w-5 ${criticalCount > 0 ? 'text-immo-status-red' : 'text-immo-accent-green'}`} />} />
      </div>

      {/* Plan filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {PLAN_FILTER_OPTIONS.map(p => {
          const isActive = planFilter === p
          const count = p === 'all' ? tenants.length : (countByPlan[p] ?? 0)
          const color = PLAN_FILTER_COLORS[p]
          return (
            <button
              key={p}
              onClick={() => setPlanFilter(p)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? 'border-transparent text-white shadow-sm'
                  : 'border-immo-border-default bg-immo-bg-card text-immo-text-secondary hover:border-immo-text-muted hover:text-immo-text-primary'
              }`}
              style={isActive ? { backgroundColor: color } : undefined}
            >
              {PLAN_FILTER_LABELS[p]}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-immo-bg-primary text-immo-text-muted'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-immo-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un tenant..."
            className="h-10 w-full rounded-lg border border-immo-border-default bg-immo-bg-card pl-10 pr-4 text-sm text-immo-text-primary placeholder-immo-text-muted outline-none focus:border-[#7C3AED]"
          />
        </div>
        <span className="shrink-0 text-xs text-immo-text-muted">{filtered.length} tenant(s)</span>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(t) => t.id}
        onRowClick={(t) => navigate(`/admin/tenants/${t.id}`)}
        emptyIcon={<Building2 className="h-10 w-10" />}
        emptyMessage={search ? 'Aucun tenant ne correspond' : 'Aucun tenant'}
        emptyDescription={search ? 'Modifiez votre recherche pour elargir les resultats.' : 'Creez votre premier tenant pour demarrer.'}
      />

      <CreateTenantModal isOpen={showCreate} onClose={() => setShowCreate(false)} onSuccess={() => refetch()} />

      <DeleteTenantModal
        isOpen={!!tenantToDelete}
        onClose={() => setTenantToDelete(null)}
        onSuccess={() => refetch()}
        tenant={tenantToDelete}
      />
    </div>
  )
}

const HEALTH_STYLES: Record<HealthStatus, { bg: string; text: string; label: string }> = {
  healthy: { bg: 'bg-immo-accent-green/10', text: 'text-immo-accent-green', label: 'OK' },
  warning: { bg: 'bg-immo-status-orange/10', text: 'text-immo-status-orange', label: 'Attention' },
  critical: { bg: 'bg-immo-status-red/10', text: 'text-immo-status-red', label: 'Critique' },
}

function HealthBadge({ status, issues }: { status: HealthStatus; issues: string[] }) {
  const style = HEALTH_STYLES[status]
  return (
    <div className="group relative">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${status === 'healthy' ? 'bg-immo-accent-green' : status === 'warning' ? 'bg-immo-status-orange' : 'bg-immo-status-red'}`} />
        {style.label}
      </span>
      {issues.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 hidden w-48 rounded-lg border border-immo-border-default bg-immo-bg-card p-2 shadow-xl group-hover:block">
          {issues.map((issue, i) => (
            <p key={i} className="text-[11px] text-immo-text-secondary">{issue}</p>
          ))}
        </div>
      )}
    </div>
  )
}
