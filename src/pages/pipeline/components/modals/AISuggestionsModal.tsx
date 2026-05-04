import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  RotateCcw, ArrowUpDown, Check, Trophy, Award, Sparkles, Loader2, AlertCircle, Maximize2, Tag, Download,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal, FilterDropdown } from '@/components/common'
import { Button } from '@/components/ui/button'
import { UNIT_TYPE_LABELS, UNIT_SUBTYPE_LABELS } from '@/types'
import type { PipelineStage, UnitType, UnitSubtype } from '@/types'
import { formatPrice, formatPriceCompact } from '@/lib/constants'

const AI_UNITS_LIMIT = 30

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
  const [aiScoreMap, setAiScoreMap] = useState<Map<string, number>>(new Map())
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [isPdfLoading, setIsPdfLoading] = useState(false)
  const compareRef = useRef<HTMLDivElement | null>(null)
  // Prefill filters from client profile
  useEffect(() => {
    if (client && isOpen) {
      setProjectFilter(client.interested_projects?.[0] ?? '')
      setTypeFilter(client.desired_unit_types?.[0] ?? '')
      setSubtypeFilter('all')
      setSortKey('score')
      setShowTop5(false)
      setSelectedIds([])
      setAiScoreMap(new Map())
      setAiError(null)
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

  // AI score (when present) overrides local rule-based score.
  const scoreMap = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(u => map.set(u.id, aiScoreMap.get(u.id) ?? scoreUnit(u)))
    return map
  }, [filtered, client, aiScoreMap])

  // Per-criterion winners across the filtered set (1st place only).
  const winners = useMemo(() => {
    let bestSurfaceId: string | null = null
    let bestSurface = -Infinity
    let bestPriceM2Id: string | null = null
    let bestPriceM2 = Infinity
    for (const u of filtered) {
      if (u.surface != null && u.surface > bestSurface) {
        bestSurface = u.surface
        bestSurfaceId = u.id
      }
      if (u.price != null && u.surface != null && u.surface > 0) {
        const pm2 = u.price / u.surface
        if (pm2 < bestPriceM2) {
          bestPriceM2 = pm2
          bestPriceM2Id = u.id
        }
      }
    }
    return { surfaceId: bestSurfaceId, priceM2Id: bestPriceM2Id }
  }, [filtered])

  async function exportPDF() {
    if (!compareRef.current || !client) return
    setIsPdfLoading(true)
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      const canvas = await html2canvas(compareRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 12

      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`Comparatif d'unités — ${client.full_name}`, margin, margin + 4)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(120)
      pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin, margin + 10)
      pdf.setTextColor(0)

      const imgWidth = pageWidth - margin * 2
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      const finalHeight = Math.min(imgHeight, pageHeight - margin * 2 - 16)
      pdf.addImage(imgData, 'PNG', margin, margin + 14, imgWidth, finalHeight)

      pdf.setFontSize(8)
      pdf.setTextColor(140)
      pdf.text('IMMO PRO-X', margin, pageHeight - 6)

      const safeName = client.full_name.replace(/[^a-z0-9-]/gi, '_').slice(0, 40)
      const dateTag = new Date().toISOString().slice(0, 10)
      pdf.save(`comparatif-${safeName}-${dateTag}.pdf`)
    } catch (err) {
      console.error('[exportPDF]', err)
    } finally {
      setIsPdfLoading(false)
    }
  }

  async function rankWithAI() {
    if (!client || filtered.length === 0) return
    setIsAiLoading(true)
    setAiError(null)
    try {
      const clientProfile = {
        budget: client.confirmed_budget,
        desired_types: client.desired_unit_types,
        interested_projects: client.interested_projects,
        interest_level: client.interest_level,
        pipeline_stage: client.pipeline_stage,
      }
      const unitsList = filtered.slice(0, AI_UNITS_LIMIT).map(u => ({
        unit_id: u.id,
        type: u.type,
        subtype: u.subtype,
        price: u.price,
        surface: u.surface,
        floor: u.floor,
        project: u.project_name,
      }))
      const { data, error } = await supabase.functions.invoke('ai-suggestions', {
        body: { clientProfile, unitsList },
      })
      // supabase-js wraps every non-2xx response into a generic
      // FunctionsHttpError ("Edge Function returned a non-2xx status
      // code"), throwing away the JSON body where the function put the
      // real reason (plan gate, quota, Anthropic 502, etc). Read the
      // body off `error.context.response` so we can surface it.
      if (error) {
        let realMsg = error.message
        const ctx = (error as { context?: { response?: Response } }).context
        if (ctx?.response) {
          try {
            const body = await ctx.response.clone().json() as { error?: string }
            if (body?.error) realMsg = body.error
          } catch { /* body wasn't JSON, keep generic message */ }
        }
        throw new Error(realMsg)
      }
      const ranking = (data?.ranking ?? []) as Array<{ unit_id: string; rank: number }>
      const newMap = new Map<string, number>()
      ranking.forEach(r => {
        newMap.set(r.unit_id, Math.max(0, 100 - (r.rank - 1) * 5))
      })
      setAiScoreMap(newMap)
      setSortKey('score')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Echec du classement IA'
      setAiError(msg)
    } finally {
      setIsAiLoading(false)
    }
  }

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
    setAiScoreMap(new Map())
    setAiError(null)
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
          <FilterDropdown label="Projet" options={projectOptions} value={projectFilter} onChange={v => { setProjectFilter(v); setAiScoreMap(new Map()) }} />
          <FilterDropdown label="Type" options={typeOptions} value={typeFilter} onChange={v => { setTypeFilter(v); setAiScoreMap(new Map()) }} />
          <FilterDropdown label="Sous-type" options={subtypeOptions} value={subtypeFilter} onChange={v => { setSubtypeFilter(v); setAiScoreMap(new Map()) }} />
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-immo-text-muted hover:text-immo-text-primary">
            <RotateCcw className="me-1 h-3 w-3" /> Réinitialiser
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

          <button
            onClick={rankWithAI}
            disabled={isAiLoading || filtered.length === 0}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              aiScoreMap.size > 0
                ? 'border-blue-500/50 bg-blue-500/10 text-blue-600'
                : 'border-blue-500/30 text-blue-600 hover:bg-blue-500/10'
            }`}
            title={`Classer les ${Math.min(filtered.length, AI_UNITS_LIMIT)} 1ères unités via Claude`}
          >
            {isAiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {aiScoreMap.size > 0 ? 'Re-classer IA' : 'Classer avec IA'}
          </button>

          <span className="ms-auto text-[11px] text-immo-text-muted">
            {sorted.length} disponible{sorted.length > 1 ? 's' : ''}
          </span>
        </div>

        {aiError && (
          <div className="flex items-center gap-2 rounded-lg border border-immo-status-red/30 bg-immo-status-red/5 px-3 py-2 text-[11px] text-immo-status-red">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Classement IA indisponible : {aiError}. Utilisation du score local en fallback.</span>
          </div>
        )}

        {/* Client match criteria */}
        {client && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-[10px]">
            <span className="font-semibold text-immo-text-muted">Criteres:</span>
            {client.confirmed_budget && <span className="rounded-full bg-immo-accent-green/10 px-2 py-0.5 text-immo-accent-green">Budget: {formatPriceCompact(client.confirmed_budget)}</span>}
            {client.desired_unit_types?.map(t => <span key={t} className="rounded-full bg-immo-accent-blue/10 px-2 py-0.5 text-immo-accent-blue">{UNIT_TYPE_LABELS[t as UnitType] ?? t}</span>)}
            {client.interested_projects?.length ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-600">{client.interested_projects.length} projet(s)</span> : null}
          </div>
        )}

        {/* Grid */}
        {sorted.length === 0 ? (
          rawUnits.length === 0 ? (
            // Tenant has zero `units` rows with status='available' —
            // it's not a filter issue, the database is empty.
            <div className="py-12 text-center">
              <p className="text-sm text-immo-text-muted">Aucune unité disponible dans votre catalogue.</p>
              <p className="mt-1 text-xs text-immo-text-muted">
                Créez vos projets et unités depuis <span className="font-medium text-immo-text-secondary">Projets</span> pour activer les suggestions.
              </p>
            </div>
          ) : (
            // Stock exists but the active filters wipe it — let the
            // user know they can reset rather than assume it's broken.
            <div className="py-12 text-center">
              <p className="text-sm text-immo-text-muted">Aucune unité ne correspond aux filtres actifs</p>
              <p className="mt-1 text-xs text-immo-text-muted">
                {rawUnits.length} unité{rawUnits.length > 1 ? 's' : ''} disponible{rawUnits.length > 1 ? 's' : ''} en tout — élargissez les critères.
              </p>
              <Button onClick={resetFilters} variant="ghost" size="sm" className="mt-3 text-xs text-immo-accent-green hover:bg-immo-accent-green/10">
                <RotateCcw className="me-1 h-3 w-3" /> Réinitialiser les filtres
              </Button>
            </div>
          )
        ) : (
          <div className="grid max-h-[400px] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
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
                  className={`relative rounded-xl border p-3 text-start transition-all ${
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
                    {aiScoreMap.has(u.id) && (
                      <span className="ms-auto flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600">
                        <Sparkles className="h-2.5 w-2.5" /> IA
                      </span>
                    )}
                  </div>

                  {/* Match badges (multi) */}
                  <div className="mb-2 flex flex-wrap gap-1">
                    {rank === 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-immo-accent-green/10 px-2 py-0.5 text-[10px] font-semibold text-immo-accent-green">
                        <Trophy className="h-3 w-3" /> Match
                      </span>
                    )}
                    {rank && rank >= 2 && rank <= 3 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-immo-accent-blue/10 px-2 py-0.5 text-[10px] font-semibold text-immo-accent-blue">
                        <Award className="h-3 w-3" /> Top {rank}
                      </span>
                    )}
                    {winners.surfaceId === u.id && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                        <Maximize2 className="h-3 w-3" /> + Grande
                      </span>
                    )}
                    {winners.priceM2Id === u.id && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-immo-status-orange/10 px-2 py-0.5 text-[10px] font-semibold text-immo-status-orange">
                        <Tag className="h-3 w-3" /> Meilleur Prix/m²
                      </span>
                    )}
                  </div>
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

        {/* Comparison table — visible when 2+ units selected */}
        {selectedIds.length >= 2 && (() => {
          const selectedUnits = filtered.filter(u => selectedIds.includes(u.id))
          const priceM2 = (u: AvailableUnit) =>
            u.price != null && u.surface != null && u.surface > 0
              ? Math.round(u.price / u.surface)
              : null
          const rows: Array<{
            label: string
            getValue: (u: AvailableUnit) => number | null
            format: (v: number | null) => string
            better: 'higher' | 'lower'
          }> = [
            { label: 'Prix', getValue: u => u.price, format: v => v != null ? formatPrice(v) : '—', better: 'lower' },
            { label: 'Surface', getValue: u => u.surface, format: v => v != null ? `${v} m²` : '—', better: 'higher' },
            { label: 'Prix/m²', getValue: priceM2, format: v => v != null ? `${formatPriceCompact(v)}/m²` : '—', better: 'lower' },
            { label: 'Étage', getValue: u => u.floor, format: v => v != null ? String(v) : '—', better: 'higher' },
            { label: 'Score', getValue: u => scoreMap.get(u.id) ?? 0, format: v => `${v ?? 0}%`, better: 'higher' },
          ]
          return (
            <div ref={compareRef} className="overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-immo-border-default/50 bg-immo-bg-card-hover/40 px-4 py-2">
                <Trophy className="h-3.5 w-3.5 text-immo-accent-green" />
                <h3 className="text-xs font-semibold text-immo-text-primary">
                  Comparatif des {selectedUnits.length} unités sélectionnées
                </h3>
                <span className="ms-auto hidden text-[10px] text-immo-text-muted sm:inline">Meilleure valeur surlignée par ligne</span>
                <button
                  type="button"
                  onClick={exportPDF}
                  disabled={isPdfLoading}
                  className="flex items-center gap-1 rounded-lg border border-immo-accent-blue/40 bg-immo-accent-blue/10 px-2.5 py-1 text-[11px] font-medium text-immo-accent-blue transition-colors hover:bg-immo-accent-blue/20 disabled:cursor-not-allowed disabled:opacity-50 print:hidden"
                  title="Exporter ce comparatif en PDF (envoyable au client)"
                >
                  {isPdfLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Export PDF
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-immo-border-default/30 bg-immo-bg-primary">
                      <th className="px-3 py-2 text-start font-semibold text-immo-text-muted">Critère</th>
                      {selectedUnits.map(u => (
                        <th key={u.id} className="px-3 py-2 text-start font-semibold text-immo-text-primary">
                          {u.code}
                          <span className="ms-1 text-[10px] font-normal text-immo-text-muted">{u.subtype ? UNIT_SUBTYPE_LABELS[u.subtype] ?? u.subtype : ''}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const values = selectedUnits.map(row.getValue)
                      const valid = values.filter((v): v is number => v != null)
                      const best = valid.length > 0
                        ? (row.better === 'higher' ? Math.max(...valid) : Math.min(...valid))
                        : null
                      return (
                        <tr key={row.label} className="border-b border-immo-border-default/20 last:border-0">
                          <td className="px-3 py-2 font-medium text-immo-text-muted">{row.label}</td>
                          {selectedUnits.map(u => {
                            const v = row.getValue(u)
                            const isBest = best != null && v === best && v != null
                            return (
                              <td
                                key={u.id}
                                className={`px-3 py-2 ${
                                  isBest
                                    ? 'bg-immo-accent-green/10 font-semibold text-immo-accent-green'
                                    : 'text-immo-text-primary'
                                }`}
                              >
                                {row.format(v)}
                                {isBest && <span className="ms-1 text-[9px]">✓</span>}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

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
