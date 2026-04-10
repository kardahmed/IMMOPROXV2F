import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, UserCheck, Briefcase, Plus, Search, Eye, LogIn, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { KPICard, LoadingSpinner } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useSuperAdminStore } from '@/store/superAdminStore'
import { CreateTenantModal } from './components/CreateTenantModal'
import { useTenantHealth } from './hooks/useTenantHealth'
import type { HealthStatus } from './hooks/useTenantHealth'

interface TenantRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  wilaya: string | null
  created_at: string
  agents_count: number
  clients_count: number
  projects_count: number
  units_count: number
}

export function TenantsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const { enterTenant } = useSuperAdminStore()

  // Fetch all tenants with counts
  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ['super-admin-tenants'],
    queryFn: async () => {
      const { data: rawTenants, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) { handleSupabaseError(error); throw error }
      if (!rawTenants) return []

      // Fetch counts for each tenant
      const enriched: TenantRow[] = await Promise.all(
        rawTenants.map(async (t: Record<string, unknown>) => {
          const [agents, clients, projects, units] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id as string).eq('role', 'agent'),
            supabase.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id as string),
            supabase.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id as string),
            supabase.from('units').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id as string),
          ])
          return {
            id: t.id as string,
            name: t.name as string,
            email: t.email as string | null,
            phone: t.phone as string | null,
            wilaya: t.wilaya as string | null,
            created_at: t.created_at as string,
            agents_count: agents.count ?? 0,
            clients_count: clients.count ?? 0,
            projects_count: projects.count ?? 0,
            units_count: units.count ?? 0,
          }
        })
      )
      return enriched
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

  // Filter
  const filtered = tenants.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase())
  )

  function handleAccessTenant(tenant: TenantRow) {
    enterTenant(tenant.id, tenant.name)
    navigate('/dashboard')
  }

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestion des Tenants</h1>
          <p className="text-sm text-[#7F96B7]">Gerez les agences de la plateforme</p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-[#7C3AED] font-semibold text-white hover:bg-[#6D28D9]"
        >
          <Plus className="mr-1.5 h-4 w-4" /> Nouveau Tenant
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <KPICard label="Total Tenants" value={totalTenants} accent="blue" icon={<Building2 className="h-5 w-5 text-[#7C3AED]" />} />
        <KPICard label="Tenants actifs" value={activeTenants} accent="green" icon={<UserCheck className="h-5 w-5 text-[#00D4A0]" />} />
        <KPICard label="Total Utilisateurs" value={totalUsers} accent="blue" icon={<Users className="h-5 w-5 text-[#3782FF]" />} />
        <KPICard label="Total Clients" value={totalClients} accent="orange" icon={<Briefcase className="h-5 w-5 text-[#FF9A1E]" />} />
        <KPICard label="Alertes critiques" value={criticalCount} accent={criticalCount > 0 ? 'red' : 'green'} icon={<AlertTriangle className={`h-5 w-5 ${criticalCount > 0 ? 'text-[#FF4949]' : 'text-[#00D4A0]'}`} />} />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4E6687]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un tenant..."
          className="h-10 w-full rounded-lg border border-[#1E325A] bg-[#0F1830] pl-10 pr-4 text-sm text-white placeholder-[#4E6687] outline-none focus:border-[#7C3AED]"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[#1E325A]">
        <table className="w-full">
          <thead>
            <tr className="bg-[#0F1830]">
              {['Nom', 'Sante', 'Email', 'Wilaya', 'Agents', 'Clients', 'Projets', 'Biens', 'Cree le', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#7F96B7]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E325A]">
            {filtered.map(t => (
              <tr key={t.id} className="bg-[#0A1030] transition-colors hover:bg-[#0F1830]">
                <td className="px-4 py-3.5 text-sm font-medium text-white">{t.name}</td>
                <td className="px-4 py-3.5"><HealthBadge status={healthMap.get(t.id)?.status ?? 'healthy'} issues={healthMap.get(t.id)?.issues ?? []} /></td>
                <td className="px-4 py-3.5 text-xs text-[#7F96B7]">{t.email ?? '-'}</td>
                <td className="px-4 py-3.5 text-xs text-[#7F96B7]">{t.wilaya ?? '-'}</td>
                <td className="px-4 py-3.5 text-center text-sm text-white">{t.agents_count}</td>
                <td className="px-4 py-3.5 text-center text-sm text-white">{t.clients_count}</td>
                <td className="px-4 py-3.5 text-center text-sm text-white">{t.projects_count}</td>
                <td className="px-4 py-3.5 text-center text-sm text-white">{t.units_count}</td>
                <td className="px-4 py-3.5 text-xs text-[#7F96B7]">{new Date(t.created_at).toLocaleDateString('fr')}</td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1">
                    <button onClick={() => navigate(`/admin/tenants/${t.id}`)} title="Voir" className="rounded-md p-1.5 text-[#7F96B7] hover:bg-[#1E325A] hover:text-white">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleAccessTenant(t)} title="Acceder" className="rounded-md p-1.5 text-[#7C3AED] hover:bg-[#7C3AED]/10">
                      <LogIn className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-[#7F96B7]">Aucun tenant trouve</div>
        )}
      </div>

      <CreateTenantModal isOpen={showCreate} onClose={() => setShowCreate(false)} onSuccess={refetch} />
    </div>
  )
}

const HEALTH_STYLES: Record<HealthStatus, { bg: string; text: string; label: string }> = {
  healthy: { bg: 'bg-[#00D4A0]/10', text: 'text-[#00D4A0]', label: 'OK' },
  warning: { bg: 'bg-[#FF9A1E]/10', text: 'text-[#FF9A1E]', label: 'Attention' },
  critical: { bg: 'bg-[#FF4949]/10', text: 'text-[#FF4949]', label: 'Critique' },
}

function HealthBadge({ status, issues }: { status: HealthStatus; issues: string[] }) {
  const style = HEALTH_STYLES[status]
  return (
    <div className="group relative">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${status === 'healthy' ? 'bg-[#00D4A0]' : status === 'warning' ? 'bg-[#FF9A1E]' : 'bg-[#FF4949]'}`} />
        {style.label}
      </span>
      {issues.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 hidden w-48 rounded-lg border border-[#1E325A] bg-[#0F1830] p-2 shadow-xl group-hover:block">
          {issues.map((issue, i) => (
            <p key={i} className="text-[11px] text-[#7F96B7]">{issue}</p>
          ))}
        </div>
      )}
    </div>
  )
}
