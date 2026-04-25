import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  RotateCcw, ArrowUpDown, Check, Trophy, Award,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal, FilterDropdown } from '@/components/common'
import { Button } from '@/components/ui/button'
import { UNIT_TYPE_LABELS, UNIT_SUBTYPE_LABELS } from '@/types'
import type { PipelineStage, UnitType, UnitSubtype } from '@/types'
import { formatPrice, formatPriceCompact } from '@/lib/constants'

/* ═══ Types ═══ */

interface ClientInfo {
  id: string
  full_name: string
  phone: string
  confirmed_budget: number | null
  desired_unit_types: string[] | null
  interested_projects: string[] | null
  interest_level: string | null
  pipeline_stage: PipelineStage
  tenant_id: string | null
}

interface AvailableUnit {
  id: string
  code: string
  type: UnitType
  subtype: UnitSubtype | null
  building: string | null
  floor: number | null
  surface: number | null
  price: number | null
  delivery_date: string | null
  project_id: string
  project_name: string
}

type SortKey = 'score' | 'price' | 'price_m2' | 'surface' | 'floor'

interface AISuggestionsModalProps {
  isOpen: boolean
  onClose: () => void
  client: ClientInfo | null
  onSelectUnits?: (unitIds: string[]) => void
}

/* ═══ Component ═══ */

export function AISuggestionsModal({ isOpen, onClose, client, onSelectUnits }: AISuggestionsModalProps) {
  const [projectFilter, setProjectFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [subtypeFilter, setSubtypeFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [showTop5, setShowTop5] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Prefill filters from client profile
  useEffect(() => {
    if (client && isOpen) {
      setProjectFilter(client.interested_projects?.[0] ?? '')
      setTypeFilter(client.desired_unit_types?.[0] ?? '')
      setSubtypeFilter('all')
      setSortKey('score')
      setShowTop5(false)
      setSelectedIds([])
    }
  }, [client, isOpen])

  // Fetch available units
  const { data: rawUnits = [] } = useQuery({
    queryKey: ['ai-units', client?.tenant_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('units')
        .select('id, code, type, subtype, building, floor, surface, price, delivery_date, project_id, projects(name)')
        .eq('tenant_id', client!.tenant_id!)
        .eq('status', 'available')
        .order('code')
      return (data ?? []).map((u: Record<string, unknown>) => ({
        ...u,
        project_name: (u.projects as { name: string } | null)?.name ?? '-',
      })) as unknown as AvailableUnit[]
    },
    enabled: !!client?.tenant_id && isOpen,
  })

  // Fetch projects for filter
  const { data: projects = [] } = useQuery({
    queryKey: ['ai-projects', client?.tenant_id],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('tenant_id', client!.tenant_id!).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
    enabled: !!client?.tenant_id && isOpen,
  })

  // Filter units
  const filtered = useMemo(() => {
    return rawUnits.filter(u => {
      if (projectFilter && u.project_id !== projectFilter) return false
      if (typeFilter && u.type !== typeFilter) return false
      if (subtypeFilter !== 'all' && u.subtype !== subtypeFilter) return false
      return true
    })
  }, [rawUnits, projectFilter, typeFilter, subtypeFilter])

  // Smart scoring: match units to client profile
  function scoreUnit(u: AvailableUnit): number {
    if (!client) return 0
    let score = 0
    const budget = client.confirmed_budget ?? 0

    // Budget match (40 points max)
    if (budget > 0 && u.price) {
      const ratio = u.price / budget
      if (ratio >= 0.8 && ratio <= 1.0) score += 40       // Within budget, great
      else if (ratio >= 0.6 && ratio < 0.8) score += 30   // Under budget
      else if (ratio > 1.0 && ratio <= 1.15) score += 25  // Slightly over, negotiable
      else if (ratio > 1.15 && ratio <= 1.3) score += 10  // Over budget
      // else 0 — way out of range
    }

    // Type match (25 points)
    if (client.desired_unit_types?.includes(u.type)) score += 25

    // Project match (20 points)
    if (client.interested_projects?.includes(u.project_id)) score += 20

    // Price/m2 efficiency bonus (10 points)
    if (u.price && u.surface && u.surface > 0) {
      const pm2 = u.price / u.surface
      if (pm2 < 120000) score += 10       // Very good price/m2
      else if (pm2 < 150000) score += 7
      else if (pm2 < 180000) score += 4
    }

    // Floor preference (5 points) — higher floors generally preferred
    if (u.floor && u.floor >= 3 && u.floor <= 8) score += 5
    else if (u.floor && u.floor > 8) score += 3

    return score
  }

  const scoreMap = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(u => map.set(u.id, scoreUnit(u)))
    return map
  }, [filtered, client])

  // Sort
  const sorted = useMemo(() => {
    const list = [...filtered]

    if (sortKey === 'score') {
      list.sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0))
    } else if (sortKey === 'price') {
      list.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    } else if (sortKey === 'price_m2') {
      const pm2 = (u: AvailableUnit) => u.price && u.surface ? u.price / u.surface : 0
      list.sort((a, b) => pm2(a) - pm2(b))
    } else if (sortKey === 'surface') {
      list.sort((a, b) => (b.surface ?? 0) - (a.surface ?? 0))
    } else if (sortKey === 'floor') {
      list.sort((a, b) => (a.floor ?? 0) - (b.floor ?? 0))
    }

    return showTop5 ? list.slice(0, 5) : list
  }, [filtered, sortKey, scoreMap, showTop5])

  // Available subtypes
  const subtypes = useMemo(() => {
    const set = new Set<string>()
    filtered.forEach(u => { if (u.subtype) set.add(u.subtype) })
    return Array.from(set)
  }, [filtered])

  // Get rank from score
  function getRank(unitId: string): number | null {
    const sortedByScore = [...filtered].sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0))
    const idx = sortedByScore.findIndex(u => u.id === unitId)
    return idx >= 0 ? idx + 1 : null
  }

  function toggleUnit(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function resetFilters() {
    setProjectFilter(client?.interested_projects?.[0] ?? '')
    setTypeFilter(client?.desired_unit_types?.[0] ?? '')
    setSubtypeFilter('all')
    setSortKey('score')
    setShowTop5(false)
  }

  // Filter options
  const projectOptions = [
    { value: '', label: 'Tous les projets' },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ]
  const typeOptions = [
    { value: '', label: 'Tous les types' },
    ...Object.entries(UNIT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
  ]
  const subtypeOptions = [
    { value: 'all', label: 'Tous' },
    ...subtypes.map(s => ({ value: s, label: UNIT_SUBTYPE_LABELS[s as UnitSubtype] ?? s })),
  ]

  const SORT_BUTTONS: { key: SortKey; label: string }[] = [
    { key: 'score', label: 'Meilleur match' },
    { key: 'price', label: 'Prix' },
    { key: 'price_m2', label: 'Prix/m²' },
    { key: 'surface', label: 'Surface' },
    { key: 'floor', label: 'Etage' },
  ]

  if (!client) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comparateur d'Unités" subtitle={`Comparez les unités disponibles pour ${client.full_name}`} size="xl">
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown label="Projet" options={projectOptions} value={projectFilter} onChange={setProjectFilter} />
          <FilterDropdown label="Type" options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
          <FilterDropdown label="Sous-type" options={subtypeOptions} value={subtypeFilter} onChange={setSubtypeFilter} />
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-immo-text-muted hover:text-immo-text-primary">
            <RotateCcw className="mr-1 h-3 w-3" /> Réinitialiser
          </Button>
        </div>

        {/* Sort bar */}
        <div className="flex flex-wrap items-center gap-2">
          {SORT_BUTTONS.map(s => (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key)}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                sortKey === s.key
                  ? s.key === 'score'
                    ? 'border-immo-accent-green/50 bg-immo-accent-green/10 text-immo-accent-green'
                    : 'border-immo-accent-blue/50 bg-immo-accent-blue/10 text-immo-accent-blue'
                  : 'border-immo-border-default text-immo-text-muted hover:border-immo-text-muted'
              }`}
            >
              {s.key === 'score' ? <Trophy className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3" />}
              {s.label}
            </button>
          ))}

          <button
            onClick={() => setShowTop5(!showTop5)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              showTop5 ? 'border-immo-accent-green/50 bg-immo-accent-green/10 text-immo-accent-green' : 'border-immo-border-default text-immo-text-muted'
            }`}
          >
            Top 5
          </button>

          <span className="ml-auto text-[11px] text-immo-text-muted">
            {sorted.length} disponible{sorted.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Client match criteria */}
        {client && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-[10px]">
            <span className="font-semibold text-immo-text-muted">Criteres:</span>
            {client.confirmed_budget && <span className="rounded-full bg-immo-accent-green/10 px-2 py-0.5 text-immo-accent-green">Budget: {formatPriceCompact(client.confirmed_budget)}</span>}
            {client.desired_unit_types?.map(t => <span key={t} className="rounded-full bg-immo-accent-blue/10 px-2 py-0.5 text-immo-accent-blue">{UNIT_TYPE_LABELS[t as UnitType] ?? t}</span>)}
            {client.interested_projects?.length ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-600">{client.interested_projects.length} projet(s)</span> : null}
          </div>
        )}

        {/* Grid */}
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-immo-text-muted">Aucune unité disponible avec ces filtres</div>
        ) : (
          <div className="grid max-h-[400px] grid-cols-3 gap-3 overflow-y-auto">
            {sorted.map(u => {
              const rank = getRank(u.id)
              const score = scoreMap.get(u.id) ?? 0
              const selected = selectedIds.includes(u.id)
              const priceM2 = u.price && u.surface ? Math.round(u.price / u.surface) : null

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUnit(u.id)}
                  className={`relative rounded-xl border p-3 text-left transition-all ${
                    selected
                      ? 'border-immo-accent-green/50 bg-immo-accent-green/5 ring-1 ring-immo-accent-green/20'
                      : 'border-immo-border-default bg-immo-bg-card hover:border-immo-text-muted'
                  }`}
                >
                  {/* Selection checkbox */}
                  <div className="absolute right-2 top-2">
                    <div className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${
                      selected ? 'border-immo-accent-green bg-immo-accent-green' : 'border-immo-border-default'
                    }`}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>

                  {/* Code + badges */}
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-immo-text-primary">{u.code}</span>
                    {u.subtype && <span className="text-[11px] text-immo-text-muted">{UNIT_SUBTYPE_LABELS[u.subtype] ?? u.subtype}</span>}
                  </div>

                  {/* Match badges */}
                  {rank === 1 && (
                    <div className="mb-2 flex items-center gap-1 rounded-full bg-immo-accent-green/10 px-2 py-0.5 text-[10px] font-semibold text-immo-accent-green">
                      <Trophy className="h-3 w-3" /> Meilleur match
                    </div>
                  )}
                  {rank && rank >= 2 && rank <= 3 && (
                    <div className="mb-2 flex items-center gap-1 rounded-full bg-immo-accent-blue/10 px-2 py-0.5 text-[10px] font-semibold text-immo-accent-blue">
                      <Award className="h-3 w-3" /> Top {rank}
                    </div>
                  )}
                  {/* Score bar */}
                  <div className="mb-2 flex items-center gap-1.5">
                    <div className="h-1 flex-1 rounded-full bg-immo-border-default">
                      <div className="h-full rounded-full bg-immo-accent-green transition-all" style={{ width: `${score}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-immo-text-muted">{score}%</span>
                  </div>

                  {/* Details */}
                  <div className="mb-2 flex items-center gap-3 text-xs text-immo-text-muted">
                    {u.surface != null && <span>{u.surface} m²</span>}
                    {u.floor != null && <span>Ét. {u.floor}</span>}
                    {u.building && <span>{u.building}</span>}
                  </div>

                  {/* Price */}
                  <div>
                    <p className="text-sm font-bold text-immo-accent-green">
                      {u.price != null ? formatPrice(u.price) : '-'}
                    </p>
                    {priceM2 && (
                      <p className="text-[10px] text-immo-text-muted">
                        {formatPriceCompact(priceM2)}/m²
                      </p>
                    )}
                  </div>

                  {/* Project */}
                  <p className="mt-1 truncate text-[10px] text-immo-text-muted">{u.project_name}</p>
                </button>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-immo-border-default pt-4">
          <span className="text-xs text-immo-text-muted">
            {selectedIds.length > 0 ? `${selectedIds.length} unité(s) sélectionnée(s)` : 'Sélectionnez des unités pour continuer'}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary hover:bg-immo-bg-card-hover">
              Fermer
            </Button>
            {onSelectUnits && selectedIds.length > 0 && (
              <Button
                onClick={() => { onSelectUnits(selectedIds); onClose() }}
                className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90"
              >
                Sélectionner ({selectedIds.length})
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
