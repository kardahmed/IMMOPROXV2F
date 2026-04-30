import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { handleSupabaseError } from '@/lib/errors'
import {
  Home,
  CheckCircle,
  Bookmark,
  Ban,
  DollarSign,
  Plus,
  FileText,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  ArrowUpDown,
} from 'lucide-react'
import { useUnits } from '@/hooks/useUnits'
import { useProjects } from '@/hooks/useProjects'
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard,
  SearchInput,
  FilterDropdown,
  StatusBadge,
  LoadingSpinner,
  ConfirmDialog,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatPrice, formatPriceCompact } from '@/lib/constants'
import { UNIT_TYPE_LABELS, UNIT_SUBTYPE_LABELS } from '@/types'
import type { Unit, UnitStatus } from '@/types'
import { format } from 'date-fns'
import { CreateUnitModal } from './CreateUnitModal'

const STATUS_BADGE: Record<string, { label: string; type: 'green' | 'orange' | 'blue' | 'red' | 'muted' }> = {
  available: { label: 'Disponible', type: 'green' },
  reserved: { label: 'Réservé', type: 'orange' },
  sold: { label: 'Vendu', type: 'blue' },
  blocked: { label: 'Bloqué', type: 'red' },
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'available', label: 'Disponible' },
  { value: 'reserved', label: 'Réservé' },
  { value: 'sold', label: 'Vendu' },
  { value: 'blocked', label: 'Bloqué' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'Tous les types' },
  ...Object.entries(UNIT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
]

const SUBTYPE_OPTIONS = [
  { value: 'all', label: 'Tous' },
  ...Object.entries(UNIT_SUBTYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
]

export function UnitsTab() {
  const qc = useQueryClient()
  const { units: rawUnits, isLoading, updateUnitStatus } = useUnits()
  const { projects } = useProjects()
  const { canManageProjects, canDeleteData } = usePermissions()

  const units = rawUnits as unknown as Unit[]
  const tenantId = useAuthStore(s => s.tenantId)

  // Audit (HIGH): the previous version showed `agent_id.slice(0, 8)`
  // (UUID truncated) instead of the agent's name — looked like the
  // page was cut off mid-development. Build name maps so the table
  // shows actual humans.
  const { data: agentNames = new Map<string, string>() } = useQuery({
    queryKey: ['units-agent-names', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name').eq('tenant_id', tenantId!)
      const m = new Map<string, string>()
      for (const u of (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>) {
        m.set(u.id, `${u.first_name} ${u.last_name}`.trim())
      }
      return m
    },
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  })

  const { data: clientNames = new Map<string, string>() } = useQuery({
    queryKey: ['units-client-names', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, full_name').eq('tenant_id', tenantId!).is('deleted_at', null)
      const m = new Map<string, string>()
      for (const c of (data ?? []) as Array<{ id: string; full_name: string }>) {
        m.set(c.id, c.full_name)
      }
      return m
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  })

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [subtypeFilter, setSubtypeFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [surfaceMin, setSurfaceMin] = useState('')
  const [surfaceMax, setSurfaceMax] = useState('')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const projectOptions = useMemo(() => [
    { value: 'all', label: 'Tous les projets' },
    ...projects.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` })),
  ], [projects])

  // Project name map
  const projectMap = useMemo(() => {
    const m = new Map<string, string>()
    projects.forEach((p) => m.set(p.id, p.name))
    return m
  }, [projects])

  // Filter
  const filtered = useMemo(() => {
    return units.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false
      if (typeFilter !== 'all' && u.type !== typeFilter) return false
      if (subtypeFilter !== 'all' && u.subtype !== subtypeFilter) return false
      if (projectFilter !== 'all' && u.project_id !== projectFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!u.code.toLowerCase().includes(q)) return false
      }
      if (surfaceMin && u.surface != null && u.surface < Number(surfaceMin)) return false
      if (surfaceMax && u.surface != null && u.surface > Number(surfaceMax)) return false
      if (priceMin && u.price != null && u.price < Number(priceMin)) return false
      if (priceMax && u.price != null && u.price > Number(priceMax)) return false
      return true
    })
  }, [units, statusFilter, typeFilter, subtypeFilter, projectFilter, search, surfaceMin, surfaceMax, priceMin, priceMax])

  // KPIs
  const total = units.length
  const available = units.filter((u) => u.status === 'available').length
  const reserved = units.filter((u) => u.status === 'reserved').length
  const sold = units.filter((u) => u.status === 'sold').length
  const blocked = units.filter((u) => u.status === 'blocked').length
  const totalValue = units.reduce((s, u) => s + (u.price ?? 0), 0)
  const soldValue = units.filter((u) => u.status === 'sold').reduce((s, u) => s + (u.price ?? 0), 0)

  // Progress bar segments
  const pct = (n: number) => total > 0 ? (n / total) * 100 : 0

  function handleStatusChange(id: string, status: UnitStatus) {
    updateUnitStatus.mutate({ id, status })
  }

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  const inputClass = 'h-9 w-[110px] border-immo-border-default bg-immo-bg-primary text-sm text-immo-text-primary placeholder:text-immo-text-muted'

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <KPICard label="Total" value={total} accent="blue" icon={<Home className="h-5 w-5 text-immo-accent-blue" />} />
        <KPICard label="Disponibles" value={available} accent="blue" icon={<Home className="h-5 w-5 text-immo-accent-blue" />} />
        <KPICard label="Réservés" value={reserved} accent="orange" icon={<Bookmark className="h-5 w-5 text-immo-status-orange" />} />
        <KPICard label="Vendus" value={sold} accent="green" icon={<CheckCircle className="h-5 w-5 text-immo-accent-green" />} />
        <KPICard label="Bloqués" value={blocked} accent="red" icon={<Ban className="h-5 w-5 text-immo-status-red" />} />
        <KPICard label="Valeur totale" value={formatPriceCompact(totalValue)} accent="blue" icon={<DollarSign className="h-5 w-5 text-immo-accent-blue" />} />
        <KPICard label="Valeur vendue" value={formatPriceCompact(soldValue)} accent="green" icon={<DollarSign className="h-5 w-5 text-immo-accent-green" />} />
      </div>

      {/* Global progress */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-immo-text-secondary">
            {sold + reserved} / {total} unités commercialisées
          </span>
          <span className="font-semibold text-immo-text-primary">
            {pct(sold + reserved).toFixed(0)}%
          </span>
        </div>
        <div className="mb-3 h-3 overflow-hidden rounded-full bg-immo-bg-primary">
          <div className="flex h-full">
            <div className="bg-immo-accent-green" style={{ width: `${pct(sold)}%` }} />
            <div className="bg-immo-status-orange" style={{ width: `${pct(reserved)}%` }} />
            <div className="bg-immo-status-red" style={{ width: `${pct(blocked)}%` }} />
            <div className="bg-immo-accent-blue/40" style={{ width: `${pct(available)}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-[11px]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-immo-accent-green" /> Vendus ({sold})</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-immo-status-orange" /> Réservés ({reserved})</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-immo-status-red" /> Bloqués ({blocked})</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-immo-accent-blue/40" /> Disponibles ({available})</span>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput placeholder="Rechercher par code..." value={search} onChange={setSearch} className="w-[220px]" />
          <FilterDropdown label="Projet" options={projectOptions} value={projectFilter} onChange={setProjectFilter} />
          <FilterDropdown label="Type" options={TYPE_OPTIONS} value={typeFilter} onChange={setTypeFilter} />
          <FilterDropdown label="Sous-type" options={SUBTYPE_OPTIONS} value={subtypeFilter} onChange={setSubtypeFilter} />
          <FilterDropdown label="Statut" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-immo-text-muted hover:text-immo-text-primary"
          >
            <ArrowUpDown className="mr-1 h-3.5 w-3.5" />
            {showAdvanced ? 'Masquer filtres' : 'Plus de filtres'}
          </Button>
          <div className="ml-auto">
            {canManageProjects && (
              <Button
                onClick={() => setShowCreate(true)}
                className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Nouvelle unité
              </Button>
            )}
          </div>
        </div>

        {showAdvanced && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-card-hover p-3">
            <span className="text-xs text-immo-text-muted">Surface (m²) :</span>
            <Input type="number" placeholder="Min" value={surfaceMin} onChange={(e) => setSurfaceMin(e.target.value)} className={inputClass} />
            <span className="text-xs text-immo-text-muted">—</span>
            <Input type="number" placeholder="Max" value={surfaceMax} onChange={(e) => setSurfaceMax(e.target.value)} className={inputClass} />
            <span className="ml-3 text-xs text-immo-text-muted">Prix (DA) :</span>
            <Input type="number" placeholder="Min" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} className={inputClass} />
            <span className="text-xs text-immo-text-muted">—</span>
            <Input type="number" placeholder="Max" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} className={inputClass} />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-immo-border-default">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-immo-bg-card-hover">
                {['Code', 'Projet', 'Type', 'Sous-type', 'Bâtiment', 'Étage', 'Surface', 'Prix', 'Livraison', 'Agent', 'Client', 'Plan 2D', 'Statut', ''].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-immo-border-default">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-16 text-center text-sm text-immo-text-muted">
                    Aucune unité trouvée
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const st = STATUS_BADGE[u.status] ?? STATUS_BADGE.available
                  return (
                    <tr key={u.id} className="bg-immo-bg-card transition-colors hover:bg-immo-bg-card-hover">
                      <td className="whitespace-nowrap px-3 py-3 text-xs font-mono text-immo-text-primary">{u.code}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-immo-text-secondary">{projectMap.get(u.project_id) ?? '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs">{UNIT_TYPE_LABELS[u.type] ?? u.type}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-immo-text-muted">{u.subtype ? UNIT_SUBTYPE_LABELS[u.subtype] : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-immo-text-muted">{u.building ?? '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-immo-text-muted">{u.floor ?? '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs">{u.surface != null ? `${u.surface} m²` : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-immo-text-primary">{u.price != null ? formatPrice(u.price) : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-immo-text-muted">{u.delivery_date ? format(new Date(u.delivery_date), 'MM/yyyy') : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-immo-text-muted">{u.agent_id ? (agentNames.get(u.agent_id) ?? '—') : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-immo-text-muted">{u.client_id ? (clientNames.get(u.client_id) ?? '—') : '-'}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {u.plan_2d_url ? (
                          <a href={u.plan_2d_url} target="_blank" rel="noopener noreferrer" className="text-immo-accent-blue hover:underline">
                            <FileText className="h-4 w-4" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-immo-text-muted">Aucun</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <StatusBadge label={st.label} type={st.type} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-md text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="border-immo-border-default bg-immo-bg-card">
                            <DropdownMenuItem className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover">
                              <Eye className="mr-2 h-3.5 w-3.5" /> Voir détail
                            </DropdownMenuItem>
                            {canManageProjects && (
                              <DropdownMenuItem className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover">
                                <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator className="bg-immo-border-default" />
                            {canManageProjects && u.status !== 'available' && (
                              <DropdownMenuItem
                                onClick={() => handleStatusChange(u.id, 'available')}
                                className="text-sm text-immo-accent-green focus:bg-immo-accent-green-bg"
                              >
                                Rendre disponible
                              </DropdownMenuItem>
                            )}
                            {canManageProjects && u.status !== 'blocked' && (
                              <DropdownMenuItem
                                onClick={() => handleStatusChange(u.id, 'blocked')}
                                className="text-sm text-immo-status-orange focus:bg-immo-status-orange-bg"
                              >
                                Bloquer
                              </DropdownMenuItem>
                            )}
                            {canDeleteData && (
                              <>
                                <DropdownMenuSeparator className="bg-immo-border-default" />
                                <DropdownMenuItem
                                  onClick={() => setDeleteId(u.id)}
                                  className="text-sm text-immo-status-red focus:bg-immo-status-red-bg"
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Count footer */}
        <div className="border-t border-immo-border-default bg-immo-bg-card-hover px-4 py-2 text-xs text-immo-text-muted">
          {filtered.length} unité{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}
          {filtered.length !== total && ` sur ${total}`}
        </div>
      </div>

      {/* Create modal */}
      <CreateUnitModal isOpen={showCreate} onClose={() => setShowCreate(false)} />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (deleteId) {
            const { error } = await supabase.from('units').delete().eq('id', deleteId)
            if (error) handleSupabaseError(error)
            else qc.invalidateQueries({ queryKey: ['units'] })
          }
          setDeleteId(null)
        }}
        title="Supprimer cette unité ?"
        description="Les réservations et ventes liées seront supprimées. Cette action est irréversible."
        confirmLabel="Supprimer"
        confirmVariant="danger"
      />
    </div>
  )
}
