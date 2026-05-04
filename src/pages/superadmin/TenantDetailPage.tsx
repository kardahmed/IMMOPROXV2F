import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Users, Briefcase, Building2, DollarSign, Bookmark, CheckCircle, Home, AlertTriangle, Power, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Card, KPICard, PageSkeleton, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { useSuperAdminStore } from '@/store/superAdminStore'
import { formatPriceCompact } from '@/lib/constants'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { UserManagementPanel } from './components/UserManagementPanel'
import { PlanBadge } from './components/PlanBadge'
import { ChangePlanModal } from './components/ChangePlanModal'
import { DuplicateConfigModal } from './components/DuplicateConfigModal'
import type { PlanKey } from './hooks/usePlanLimits'
import toast from 'react-hot-toast'

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { enterTenant } = useSuperAdminStore()
  const [showChangePlan, setShowChangePlan] = useState(false)
  const [showDuplicate, setShowDuplicate] = useState(false)

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
      toast.success(wasOn ? 'Maintenance désactivée' : 'Maintenance activée')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const isMaintenance = tenantSettings?.maintenance_mode ?? false

  if (loadingTenant || !tenant) return <PageSkeleton kpiCount={7} />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/admin')}
            aria-label="Retour a la liste des tenants"
            className="shrink-0 rounded-lg p-2 text-immo-text-secondary transition-colors hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0579DA]/40"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold text-immo-text-primary">{tenant.name as string}</h1>
              <PlanBadge plan={(tenant.plan as string) ?? 'free'} />
            </div>
            <p className="truncate text-sm text-immo-text-secondary">{(tenant.email as string) ?? '-'} · {(tenant.wilaya as string) ?? '-'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setShowDuplicate(true)}
            className="border border-immo-border-default bg-transparent text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary"
          >
            Dupliquer config
          </Button>
          <Button
            onClick={() => setShowChangePlan(true)}
            variant="blue-outline"
          >
            Changer le plan
          </Button>
          <Button
            onClick={() => toggleMaintenance.mutate()}
            disabled={toggleMaintenance.isPending}
            className={isMaintenance
              ? 'border border-immo-status-red/30 bg-immo-status-red/10 text-immo-status-red hover:bg-immo-status-red/20'
              : 'border border-immo-border-default bg-transparent text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary'
            }
          >
            <Power className="me-1.5 h-4 w-4" />
            {isMaintenance ? 'Desactiver maintenance' : 'Maintenance'}
          </Button>
          <Button onClick={() => { enterTenant(tenantId!, tenant.name as string); navigate('/dashboard') }} variant="blue">
            Acceder au tenant
          </Button>
        </div>
      </div>

      {/* Maintenance banner */}
      {isMaintenance && (
        <div className="flex items-center gap-3 rounded-xl border border-immo-status-red/30 bg-immo-status-red-bg px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-immo-status-red" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-immo-status-red">Mode maintenance actif</p>
            <p className="text-[11px] text-immo-status-red/70">Les utilisateurs de ce tenant ne peuvent pas acceder a l'application</p>
          </div>
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
          <KPICard label="Agents" value={kpis.agents} accent="blue" icon={<Users className="h-5 w-5 text-immo-accent-blue" />} />
          <KPICard label="Clients" value={kpis.clients} accent="orange" icon={<Briefcase className="h-5 w-5 text-immo-status-orange" />} />
          <KPICard label="Projets" value={kpis.projects} accent="blue" icon={<Building2 className="h-5 w-5 text-[#0579DA]" />} />
          <KPICard label="Biens" value={kpis.units} accent="blue" icon={<Home className="h-5 w-5 text-immo-accent-blue" />} />
          <KPICard label="CA" value={formatPriceCompact(kpis.revenue)} accent="green" icon={<DollarSign className="h-5 w-5 text-immo-accent-green" />} />
          <KPICard label="Reservations" value={kpis.reservations} accent="orange" icon={<Bookmark className="h-5 w-5 text-immo-status-orange" />} />
          <KPICard label="Ventes" value={kpis.sales} accent="green" icon={<CheckCircle className="h-5 w-5 text-immo-accent-green" />} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Users — full management panel */}
        <UserManagementPanel tenantId={tenantId!} />

        {/* Projects */}
        <Card noPadding>
          <div className="border-b border-immo-border-default px-5 py-4">
            <h3 className="text-sm font-semibold text-immo-text-primary">Projets ({projects.length})</h3>
          </div>
          <div className="max-h-[400px] divide-y divide-immo-border-default overflow-y-auto">
            {projects.map(p => {
              const units = (p.units as Array<{ id: string; status: string }>) ?? []
              const sold = units.filter(u => u.status === 'sold').length
              return (
                <div key={p.id as string} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-immo-text-primary">{p.name as string}</p>
                    <p className="text-[11px] text-immo-text-secondary">{units.length} biens · {sold} vendus</p>
                  </div>
                  <StatusBadge label={p.status as string} type={p.status === 'active' ? 'green' : 'muted'} />
                </div>
              )
            })}
            {projects.length === 0 && (
              <div className="px-5 py-12 text-center">
                <Building2 className="mx-auto mb-2 h-8 w-8 text-immo-text-muted" />
                <p className="text-sm text-immo-text-secondary">Aucun projet pour ce tenant</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Activity */}
      <Card noPadding>
        <div className="border-b border-immo-border-default px-5 py-4">
          <h3 className="text-sm font-semibold text-immo-text-primary">Activite recente</h3>
        </div>
        <div className="max-h-[300px] divide-y divide-immo-border-default overflow-y-auto">
          {history.map(h => {
            const agent = h.users as { first_name: string; last_name: string } | null
            return (
              <div key={h.id as string} className="flex items-center gap-3 px-5 py-3">
                <div className="h-2 w-2 shrink-0 rounded-full bg-[#0579DA]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-immo-text-primary">{h.title as string}</p>
                  {agent && <p className="text-[11px] text-immo-text-secondary">{agent.first_name} {agent.last_name}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-immo-text-secondary">
                  {formatDistanceToNow(new Date(h.created_at as string), { addSuffix: true, locale: fr })}
                </span>
              </div>
            )
          })}
          {history.length === 0 && <div className="py-8 text-center text-sm text-immo-text-secondary">Aucune activite</div>}
        </div>
      </Card>

      {/* Export */}
      <ExportPanel tenantId={tenantId!} tenantName={tenant.name as string} />

      {/* Duplicate config modal */}
      <DuplicateConfigModal
        isOpen={showDuplicate}
        onClose={() => setShowDuplicate(false)}
        sourceTenantId={tenantId!}
        sourceTenantName={tenant.name as string}
      />

      {/* Change plan modal */}
      <ChangePlanModal
        isOpen={showChangePlan}
        onClose={() => setShowChangePlan(false)}
        tenantId={tenantId!}
        tenantName={tenant.name as string}
        currentPlan={((tenant.plan as string) ?? 'free') as PlanKey}
      />
    </div>
  )
}

/* ─── Export Panel ─── */

function ExportPanel({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [exporting, setExporting] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setDownloadUrl(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-tenant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      if (!res.ok) throw new Error('Export failed')
      const data = await res.json()
      setDownloadUrl(data.download_url)
      toast.success('Export généré')
    } catch {
      toast.error('Erreur lors de l\'export')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Download className="h-5 w-5 text-[#0579DA]" />
        <h3 className="text-sm font-semibold text-immo-text-primary">Export donnees</h3>
      </div>
      <p className="mb-3 text-[11px] text-immo-text-muted">
        Exporter toutes les donnees de {tenantName} (clients, projets, unites, ventes, historique) au format JSON.
      </p>
      <Button
        onClick={handleExport}
        disabled={exporting}
        variant="blue-outline"
      >
        {exporting ? <div className="me-2 h-4 w-4 animate-spin rounded-full border-2 border-[#0579DA] border-t-transparent" /> : <Download className="me-1.5 h-4 w-4" />}
        {exporting ? 'Export en cours...' : 'Exporter'}
      </Button>
      {downloadUrl && (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block text-xs text-immo-accent-blue hover:underline">
          Telecharger le fichier
        </a>
      )}
    </Card>
  )
}
