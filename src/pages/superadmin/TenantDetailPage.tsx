import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Users, Briefcase, Building2, DollarSign, Bookmark, CheckCircle, Home, AlertTriangle, Power } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { KPICard, LoadingSpinner, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useSuperAdminStore } from '@/store/superAdminStore'
import { formatPriceCompact } from '@/lib/constants'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { UserManagementPanel } from './components/UserManagementPanel'
import toast from 'react-hot-toast'

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { enterTenant } = useSuperAdminStore()

  // Tenant info
  const { data: tenant, isLoading: loadingTenant } = useQuery({
    queryKey: ['super-admin-tenant', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('*').eq('id', tenantId!).single()
      if (error) { handleSupabaseError(error); throw error }
      return data as Record<string, unknown>
    },
    enabled: !!tenantId,
  })

  // KPIs
  const { data: kpis } = useQuery({
    queryKey: ['super-admin-tenant-kpis', tenantId],
    queryFn: async () => {
      const [agents, clients, projects, units, sales, reservations] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!).in('role', ['agent', 'admin']),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!),
        supabase.from('units').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!),
        supabase.from('sales').select('final_price').eq('tenant_id', tenantId!).eq('status', 'active'),
        supabase.from('reservations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!).eq('status', 'active'),
      ])
      const revenue = (sales.data ?? []).reduce((s, r) => s + ((r as { final_price: number }).final_price ?? 0), 0)
      return {
        agents: agents.count ?? 0,
        clients: clients.count ?? 0,
        projects: projects.count ?? 0,
        units: units.count ?? 0,
        revenue,
        reservations: reservations.count ?? 0,
        sales: (sales.data ?? []).length,
      }
    },
    enabled: !!tenantId,
  })

  // Projects
  const { data: projects = [] } = useQuery({
    queryKey: ['super-admin-tenant-projects', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*, units(id, status)').eq('tenant_id', tenantId!).order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return data as Array<Record<string, unknown>>
    },
    enabled: !!tenantId,
  })

  // Recent history
  const { data: history = [] } = useQuery({
    queryKey: ['super-admin-tenant-history', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('history').select('*, users!history_agent_id_fkey(first_name, last_name)').eq('tenant_id', tenantId!).order('created_at', { ascending: false }).limit(20)
      if (error) return []
      return data as Array<Record<string, unknown>>
    },
    enabled: !!tenantId,
  })

  // Tenant maintenance status
  const { data: tenantSettings } = useQuery({
    queryKey: ['super-admin-tenant-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings').select('maintenance_mode, maintenance_message').eq('tenant_id', tenantId!).single()
      return data as { maintenance_mode: boolean; maintenance_message: string } | null
    },
    enabled: !!tenantId,
  })

  const toggleMaintenance = useMutation({
    mutationFn: async () => {
      const newMode = !(tenantSettings?.maintenance_mode ?? false)
      const { error } = await supabase.from('tenant_settings')
        .update({ maintenance_mode: newMode } as never)
        .eq('tenant_id', tenantId!)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin-tenant-settings', tenantId] })
      const wasOn = tenantSettings?.maintenance_mode ?? false
      toast.success(wasOn ? 'Maintenance desactivee' : 'Maintenance activee')
    },
  })

  const isMaintenance = tenantSettings?.maintenance_mode ?? false

  if (loadingTenant || !tenant) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin')} className="rounded-lg p-2 text-[#7F96B7] hover:bg-[#1E325A]">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{tenant.name as string}</h1>
          <p className="text-sm text-[#7F96B7]">{tenant.email as string} · {tenant.wilaya as string ?? '-'}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => toggleMaintenance.mutate()}
            disabled={toggleMaintenance.isPending}
            className={isMaintenance
              ? 'border border-[#FF4949]/30 bg-[#FF4949]/10 text-[#FF4949] hover:bg-[#FF4949]/20'
              : 'border border-[#1E325A] bg-transparent text-[#7F96B7] hover:bg-[#1E325A] hover:text-white'
            }
          >
            <Power className="mr-1.5 h-4 w-4" />
            {isMaintenance ? 'Desactiver maintenance' : 'Maintenance'}
          </Button>
          <Button onClick={() => { enterTenant(tenantId!, tenant.name as string); navigate('/dashboard') }}
            className="bg-[#7C3AED] font-semibold text-white hover:bg-[#6D28D9]">
            Acceder au tenant
          </Button>
        </div>
      </div>

      {/* Maintenance banner */}
      {isMaintenance && (
        <div className="flex items-center gap-3 rounded-xl border border-[#FF4949]/30 bg-[#320F0F]/50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-[#FF4949]" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#FF4949]">Mode maintenance actif</p>
            <p className="text-[11px] text-[#FF9A9A]">Les utilisateurs de ce tenant ne peuvent pas acceder a l'application</p>
          </div>
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-4 gap-4 xl:grid-cols-7">
          <KPICard label="Agents" value={kpis.agents} accent="blue" icon={<Users className="h-5 w-5 text-[#3782FF]" />} />
          <KPICard label="Clients" value={kpis.clients} accent="orange" icon={<Briefcase className="h-5 w-5 text-[#FF9A1E]" />} />
          <KPICard label="Projets" value={kpis.projects} accent="blue" icon={<Building2 className="h-5 w-5 text-[#7C3AED]" />} />
          <KPICard label="Biens" value={kpis.units} accent="blue" icon={<Home className="h-5 w-5 text-[#3782FF]" />} />
          <KPICard label="CA" value={formatPriceCompact(kpis.revenue)} accent="green" icon={<DollarSign className="h-5 w-5 text-[#00D4A0]" />} />
          <KPICard label="Reservations" value={kpis.reservations} accent="orange" icon={<Bookmark className="h-5 w-5 text-[#FF9A1E]" />} />
          <KPICard label="Ventes" value={kpis.sales} accent="green" icon={<CheckCircle className="h-5 w-5 text-[#00D4A0]" />} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Users — full management panel */}
        <UserManagementPanel tenantId={tenantId!} />

        {/* Projects */}
        <div className="rounded-xl border border-[#1E325A] bg-[#0A1030]">
          <div className="border-b border-[#1E325A] px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Projets ({projects.length})</h3>
          </div>
          <div className="max-h-[400px] divide-y divide-[#1E325A] overflow-y-auto">
            {projects.map(p => {
              const units = (p.units as Array<{ id: string; status: string }>) ?? []
              const sold = units.filter(u => u.status === 'sold').length
              return (
                <div key={p.id as string} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-white">{p.name as string}</p>
                    <p className="text-[11px] text-[#7F96B7]">{units.length} biens · {sold} vendus</p>
                  </div>
                  <StatusBadge label={p.status as string} type={p.status === 'active' ? 'green' : 'muted'} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="rounded-xl border border-[#1E325A] bg-[#0A1030]">
        <div className="border-b border-[#1E325A] px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Activite recente</h3>
        </div>
        <div className="max-h-[300px] divide-y divide-[#1E325A] overflow-y-auto">
          {history.map(h => {
            const agent = h.users as { first_name: string; last_name: string } | null
            return (
              <div key={h.id as string} className="flex items-center gap-3 px-5 py-3">
                <div className="h-2 w-2 shrink-0 rounded-full bg-[#7C3AED]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{h.title as string}</p>
                  {agent && <p className="text-[11px] text-[#7F96B7]">{agent.first_name} {agent.last_name}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-[#7F96B7]">
                  {formatDistanceToNow(new Date(h.created_at as string), { addSuffix: true, locale: fr })}
                </span>
              </div>
            )
          })}
          {history.length === 0 && <div className="py-8 text-center text-sm text-[#7F96B7]">Aucune activite</div>}
        </div>
      </div>
    </div>
  )
}
