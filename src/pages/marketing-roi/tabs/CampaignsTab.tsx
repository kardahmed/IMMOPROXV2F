import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Megaphone, Calendar, Pause, Play, Check, Trash2, Save, ChevronDown, ChevronUp, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { LoadingSpinner, StatusBadge, Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPriceCompact } from '@/lib/constants'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const SOURCE_OPTIONS = ['facebook_ads', 'google_ads', 'instagram_ads', 'tiktok_ads', 'print', 'event', 'other']
const EXPENSE_CATEGORIES = [
  { value: 'ads_digital', label: 'Publicite digitale' },
  { value: 'content_production', label: 'Production contenu' },
  { value: 'social_media', label: 'Reseaux sociaux' },
  { value: 'print_events', label: 'Print & evenements' },
  { value: 'seo_website', label: 'SEO & site web' },
  { value: 'other', label: 'Autre' },
]
const CAT_COLORS: Record<string, string> = {
  ads_digital: '#0579DA', content_production: '#7C3AED', social_media: '#00D4A0',
  print_events: '#F5A623', seo_website: '#06B6D4', other: '#8898AA',
}

interface Campaign {
  id: string; name: string; source: string; start_date: string; end_date: string | null
  planned_budget: number; target_leads: number; status: string; notes: string | null
  project_id: string | null; projects?: { name: string } | null
}

interface CampaignExpense {
  id: string; category: string; subcategory: string | null; amount: number
  expense_date: string; notes: string | null; campaign_id: string
}

export function CampaignsTab() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddExpense, setShowAddExpense] = useState<string | null>(null)

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['marketing-campaigns', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('marketing_campaigns').select('*, projects(name)').eq('tenant_id', tenantId!).order('start_date', { ascending: false })
      return (data ?? []) as unknown as Campaign[]
    },
    enabled: !!tenantId,
  })

  // All expenses linked to campaigns
  const { data: allExpenses = [] } = useQuery({
    queryKey: ['campaign-expenses', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('marketing_expenses').select('*').eq('tenant_id', tenantId!).not('campaign_id', 'is', null).order('expense_date', { ascending: false })
      return (data ?? []) as unknown as CampaignExpense[]
    },
    enabled: !!tenantId,
  })

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from('marketing_campaigns').update({ status } as never).eq('id', id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }) },
  })

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('marketing_expenses').delete().eq('campaign_id', id)
      await supabase.from('marketing_campaigns').delete().eq('id', id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); qc.invalidateQueries({ queryKey: ['campaign-expenses'] }); toast.success('Campagne supprimée') },
  })

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => { await supabase.from('marketing_expenses').delete().eq('id', id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign-expenses'] }); qc.invalidateQueries({ queryKey: ['marketing-expenses'] }); toast.success('Dépense supprimée') },
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  const STATUS_MAP: Record<string, { label: string; type: 'green' | 'orange' | 'muted' }> = {
    active: { label: 'Active', type: 'green' },
    paused: { label: 'En pause', type: 'orange' },
    completed: { label: 'Terminee', type: 'muted' },
  }

  // Grand totals
  const totalBudget = campaigns.reduce((s, c) => s + (c.planned_budget ?? 0), 0)
  const totalSpent = allExpenses.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-xs text-immo-text-muted">{campaigns.length} campagne(s)</p>
          <div className="flex gap-3 text-xs">
            <span className="text-immo-text-muted">Budget total: <strong className="text-immo-text-primary">{formatPriceCompact(totalBudget)} DA</strong></span>
            <span className="text-immo-text-muted">Depense: <strong className="text-immo-accent-green">{formatPriceCompact(totalSpent)} DA</strong></span>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-immo-accent-green text-white text-xs">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nouvelle campagne
        </Button>
      </div>

      {/* Campaign list with expandable expenses */}
      <div className="space-y-4">
        {campaigns.map(c => {
          const st = STATUS_MAP[c.status] ?? STATUS_MAP.active
          const expenses = allExpenses.filter(e => e.campaign_id === c.id)
          const spent = expenses.reduce((s, e) => s + e.amount, 0)
          const budgetPct = c.planned_budget > 0 ? (spent / c.planned_budget) * 100 : 0
          const isExpanded = expandedId === c.id

          return (
            <div key={c.id} className="rounded-xl border border-immo-border-default bg-immo-bg-card overflow-hidden">
              {/* Campaign header */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-immo-accent-blue/10">
                      <Megaphone className="h-5 w-5 text-immo-accent-blue" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-immo-text-primary">{c.name}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-immo-text-muted">
                        <span className="capitalize">{c.source.replace(/_/g, ' ')}</span>
                        {c.projects?.name && <><span>&middot;</span><span>{c.projects.name}</span></>}
                        <span>&middot;</span>
                        <Calendar className="h-3 w-3" />
                        {format(new Date(c.start_date), 'dd/MM/yyyy')}
                        {c.end_date && <> → {format(new Date(c.end_date), 'dd/MM/yyyy')}</>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={st.label} type={st.type} />
                    {c.status === 'active' && (
                      <button onClick={() => toggleStatus.mutate({ id: c.id, status: 'paused' })} aria-label="Mettre en pause" title="Pause" className="rounded-md p-1 text-immo-status-orange transition-colors hover:bg-immo-status-orange/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-status-orange/40"><Pause className="h-3.5 w-3.5" /></button>
                    )}
                    {c.status === 'paused' && (
                      <button onClick={() => toggleStatus.mutate({ id: c.id, status: 'active' })} aria-label="Reprendre" title="Reprendre" className="rounded-md p-1 text-immo-accent-green transition-colors hover:bg-immo-accent-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40"><Play className="h-3.5 w-3.5" /></button>
                    )}
                    {c.status !== 'completed' && (
                      <button onClick={() => toggleStatus.mutate({ id: c.id, status: 'completed' })} aria-label="Terminer la campagne" title="Terminer" className="rounded-md p-1 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"><Check className="h-3.5 w-3.5" /></button>
                    )}
                    <button onClick={() => deleteCampaign.mutate(c.id)} aria-label="Supprimer la campagne" title="Supprimer" className="rounded-md p-1 text-immo-text-muted transition-colors hover:bg-immo-status-red/5 hover:text-immo-status-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-status-red/40"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {/* Budget bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-immo-text-muted">Budget consomme</span>
                    <span className="font-semibold text-immo-text-primary">
                      {formatPriceCompact(spent)} / {formatPriceCompact(c.planned_budget)} DA ({budgetPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-immo-bg-primary">
                    <div className={`h-full rounded-full ${budgetPct > 90 ? 'bg-immo-status-red' : budgetPct > 70 ? 'bg-immo-status-orange' : 'bg-immo-accent-green'}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
                  </div>
                </div>

                {/* Expand/Collapse + Add expense */}
                <div className="flex items-center justify-between">
                  <button onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    className="flex items-center gap-1.5 text-xs font-medium text-immo-accent-blue hover:underline">
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {expenses.length} depense(s) — {isExpanded ? 'Masquer' : 'Voir detail'}
                  </button>
                  <Button size="sm" onClick={() => setShowAddExpense(c.id)} className="h-7 bg-immo-accent-green/10 text-[10px] text-immo-accent-green hover:bg-immo-accent-green/20">
                    <Plus className="mr-1 h-3 w-3" /> Ajouter depense
                  </Button>
                </div>
              </div>

              {/* Expanded expenses list */}
              {isExpanded && (
                <div className="border-t border-immo-border-default bg-immo-bg-primary/50">
                  {expenses.length === 0 ? (
                    <div className="px-5 py-6 text-center text-xs text-immo-text-muted">
                      Aucune depense enregistree pour cette campagne
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead><tr className="bg-immo-bg-card-hover">
                        {['Date', 'Categorie', 'Detail', 'Montant', ''].map(h => (
                          <th key={h} className="px-5 py-2 text-left text-[9px] font-semibold uppercase text-immo-text-muted">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody className="divide-y divide-immo-border-default">
                        {expenses.map(e => {
                          const catLabel = EXPENSE_CATEGORIES.find(ec => ec.value === e.category)?.label ?? e.category
                          const catColor = CAT_COLORS[e.category] ?? '#8898AA'
                          return (
                            <tr key={e.id} className="hover:bg-immo-bg-card-hover">
                              <td className="px-5 py-2.5 text-xs text-immo-text-secondary">{format(new Date(e.expense_date), 'dd/MM/yyyy')}</td>
                              <td className="px-5 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: catColor }} />
                                  <span className="text-xs text-immo-text-primary">{catLabel}</span>
                                </div>
                              </td>
                              <td className="px-5 py-2.5 text-xs text-immo-text-muted">{e.subcategory ?? '-'}{e.notes ? ` — ${e.notes}` : ''}</td>
                              <td className="px-5 py-2.5 text-sm font-semibold text-immo-text-primary">{e.amount.toLocaleString('fr')} DA</td>
                              <td className="px-5 py-2.5">
                                <button onClick={() => deleteExpense.mutate(e.id)} className="text-immo-text-muted hover:text-immo-status-red"><Trash2 className="h-3 w-3" /></button>
                              </td>
                            </tr>
                          )
                        })}
                        {/* Total row */}
                        <tr className="bg-immo-bg-card-hover">
                          <td colSpan={3} className="px-5 py-2.5 text-xs font-semibold text-immo-text-primary text-right">Total campagne</td>
                          <td className="px-5 py-2.5 text-sm font-bold text-immo-accent-green">{spent.toLocaleString('fr')} DA</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {campaigns.length === 0 && (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card py-16 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-immo-text-muted/30 mb-3" />
          <p className="text-sm text-immo-text-muted">Aucune campagne</p>
          <p className="text-xs text-immo-text-muted mt-1">Creez votre premiere campagne et ajoutez-y vos depenses</p>
        </div>
      )}

      {/* Create campaign modal */}
      {showCreate && <CreateCampaignModal tenantId={tenantId!} onClose={() => setShowCreate(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); setShowCreate(false) }} />}

      {/* Add expense to campaign modal */}
      {showAddExpense && <AddExpenseToCampaignModal tenantId={tenantId!} campaignId={showAddExpense} onClose={() => setShowAddExpense(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['campaign-expenses'] }); qc.invalidateQueries({ queryKey: ['marketing-expenses'] }); setShowAddExpense(null) }} />}
    </div>
  )
}

function CreateCampaignModal({ tenantId, onClose, onSaved }: { tenantId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('facebook_ads')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState('')
  const [budget, setBudget] = useState('')
  const [targetLeads, setTargetLeads] = useState('')
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-simple', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('tenant_id', tenantId).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })

  async function handleSave() {
    if (!name.trim()) { toast.error('Nom requis'); return }
    setSaving(true)
    const { error } = await supabase.from('marketing_campaigns').insert({
      tenant_id: tenantId, name: name.trim(), source, start_date: startDate,
      end_date: endDate || null, planned_budget: Number(budget) || 0,
      target_leads: Number(targetLeads) || 0, project_id: projectId || null, status: 'active',
    } as never)
    setSaving(false)
    if (error) { toast.error('Erreur'); return }
    toast.success('Campagne créée')
    onSaved()
  }

  return (
    <Modal isOpen onClose={onClose} title="Nouvelle campagne" size="sm">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-immo-text-muted">Nom de la campagne</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Lancement Marina Bay — Facebook" className="text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Source principale</label>
            <select value={source} onChange={e => setSource(e.target.value)} className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-xs text-immo-text-primary">
              {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Projet</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-xs text-immo-text-primary">
              <option value="">Aucun</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Date debut</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Date fin</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Budget prevu (DA)</label>
            <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="500000" className="text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Objectif leads</label>
            <Input type="number" value={targetLeads} onChange={e => setTargetLeads(e.target.value)} placeholder="50" className="text-sm" />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full bg-immo-accent-green text-white">
          <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Creation...' : 'Creer la campagne'}
        </Button>
      </div>
    </Modal>
  )
}

function AddExpenseToCampaignModal({ tenantId, campaignId, onClose, onSaved }: {
  tenantId: string; campaignId: string; onClose: () => void; onSaved: () => void
}) {
  const [category, setCategory] = useState('ads_digital')
  const [subcategory, setSubcategory] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!amount || Number(amount) <= 0) { toast.error('Montant requis'); return }
    setSaving(true)
    const { error } = await supabase.from('marketing_expenses').insert({
      tenant_id: tenantId, category, subcategory: subcategory || null, amount: Number(amount),
      expense_date: date, campaign_id: campaignId, notes: notes || null,
    } as never)
    setSaving(false)
    if (error) { toast.error('Erreur'); return }
    toast.success('Dépense ajoutée à la campagne')
    onSaved()
  }

  // Quick add presets — realistic for Algerian real estate
  const PRESETS = [
    { label: 'Pub Meta (FB+IG)', cat: 'ads_digital', sub: 'Meta Ads (Facebook + Instagram)' },
    { label: 'Google Ads', cat: 'ads_digital', sub: 'Google Ads' },
    { label: 'TikTok Ads', cat: 'ads_digital', sub: 'TikTok Ads' },
    { label: 'Video drone', cat: 'content_production', sub: 'Video drone' },
    { label: 'Photographe', cat: 'content_production', sub: 'Seance photo' },
    { label: 'Montage video', cat: 'content_production', sub: 'Montage video' },
    { label: 'Design graphique', cat: 'content_production', sub: 'Design graphique' },
    { label: 'Community Manager', cat: 'social_media', sub: 'Community Manager (mensuel)' },
    { label: 'Flyers / Brochures', cat: 'print_events', sub: 'Impression flyers / brochures' },
    { label: 'Panneaux / Banderoles', cat: 'print_events', sub: 'Panneaux publicitaires' },
    { label: 'Salon immobilier', cat: 'print_events', sub: 'Stand salon immobilier' },
    { label: 'Portes ouvertes', cat: 'print_events', sub: 'Evenement portes ouvertes' },
  ]

  return (
    <Modal isOpen onClose={onClose} title="Ajouter une depense" subtitle="Rattachee a cette campagne" size="sm">
      <div className="space-y-3">
        {/* Quick presets */}
        <div>
          <label className="mb-1.5 block text-xs text-immo-text-muted">Raccourcis</label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => { setCategory(p.cat); setSubcategory(p.sub) }}
                className={`rounded-md border px-2.5 py-1 text-[10px] font-medium transition-all ${
                  subcategory === p.sub ? 'border-immo-accent-green/50 bg-immo-accent-green/10 text-immo-accent-green' : 'border-immo-border-default text-immo-text-muted hover:border-immo-accent-green/30'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Categorie</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-xs text-immo-text-primary">
              {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Detail</label>
            <Input value={subcategory} onChange={e => setSubcategory(e.target.value)} placeholder="Ex: Video drone" className="text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Montant (DA)</label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="80000" className="text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Date</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-immo-text-muted">Notes</label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionnel" className="text-sm" />
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full bg-immo-accent-green text-white">
          <Receipt className="mr-1.5 h-4 w-4" /> {saving ? 'Ajout...' : 'Ajouter la depense'}
        </Button>
      </div>
    </Modal>
  )
}
