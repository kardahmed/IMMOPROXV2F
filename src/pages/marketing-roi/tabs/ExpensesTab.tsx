import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Receipt, Save, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { KPICard, LoadingSpinner, Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPriceCompact } from '@/lib/constants'
import { exportToCsv } from '@/lib/exportCsv'
import { format } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import toast from 'react-hot-toast'

const CATEGORIES = [
  { value: 'ads_digital', label: 'Publicite digitale', color: '#0579DA' },
  { value: 'content_production', label: 'Production contenu', color: '#0579DA' },
  { value: 'social_media', label: 'Reseaux sociaux', color: '#00D4A0' },
  { value: 'print_events', label: 'Print & evenements', color: '#F5A623' },
  { value: 'seo_website', label: 'SEO & site web', color: '#06B6D4' },
  { value: 'other', label: 'Autre', color: '#8898AA' },
]

interface Expense {
  id: string
  category: string
  subcategory: string | null
  amount: number
  expense_date: string
  project_id: string | null
  campaign_id: string | null
  scope: 'campaign' | 'project_overhead' | 'agency_overhead'
  is_recurring: boolean
  notes: string | null
  projects?: { name: string } | null
  marketing_campaigns?: { name: string } | null
}

const SCOPE_LABELS: Record<Expense['scope'], { label: string; hint: string; color: string }> = {
  campaign:         { label: 'Campagne',         hint: 'Liée à une campagne précise',            color: '#0579DA' },
  project_overhead: { label: 'Projet (général)', hint: 'Liée à un projet, hors campagne',         color: '#0579DA' },
  agency_overhead:  { label: 'Agence',            hint: 'Frais généraux, ne dépend pas d\'un projet', color: '#8898AA' },
}

export function ExpensesTab() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [periodFilter, setPeriodFilter] = useState<'month' | 'quarter' | 'year' | 'all'>('month')
  const [catFilter, setCatFilter] = useState('all')

  // Date range based on filter
  const now = new Date()
  const dateFrom = periodFilter === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1)
    : periodFilter === 'quarter' ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    : periodFilter === 'year' ? new Date(now.getFullYear(), 0, 1)
    : new Date(2020, 0, 1)

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['marketing-expenses', tenantId, periodFilter],
    queryFn: async () => {
      let q = supabase.from('marketing_expenses')
        .select('*, projects(name), marketing_campaigns(name)')
        .eq('tenant_id', tenantId!)
        .gte('expense_date', dateFrom.toISOString().split('T')[0])
        .order('expense_date', { ascending: false })
      const { data } = await q
      return (data ?? []) as unknown as Expense[]
    },
    enabled: !!tenantId,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-list-simple', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('tenant_id', tenantId!).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
    enabled: !!tenantId,
  })

  const { data: campaigns = [] } = useQuery({
    queryKey: ['marketing-campaigns-simple', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('marketing_campaigns').select('id, name').eq('tenant_id', tenantId!)
      return (data ?? []) as Array<{ id: string; name: string }>
    },
    enabled: !!tenantId,
  })

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => { await supabase.from('marketing_expenses').delete().eq('id', id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-expenses'] }); toast.success('Dépense supprimée') },
  })

  const filtered = catFilter === 'all' ? expenses : expenses.filter(e => e.category === catFilter)
  const totalSpent = filtered.reduce((s, e) => s + e.amount, 0)
  const byCategory = CATEGORIES.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category === cat.value).reduce((s, e) => s + e.amount, 0),
  }))

  // Monthly chart data
  const monthlyData: Array<Record<string, unknown>> = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']
    const row: Record<string, unknown> = { month: monthNames[d.getMonth()] }
    for (const cat of CATEGORIES) {
      row[cat.label] = expenses.filter(e => e.expense_date.startsWith(key) && e.category === cat.value).reduce((s, e) => s + e.amount, 0)
    }
    monthlyData.push(row)
  }

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Total depense" value={formatPriceCompact(totalSpent) + ' DA'} accent="blue" icon={<Receipt className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Ce mois" value={formatPriceCompact(expenses.filter(e => e.expense_date.startsWith(format(now, 'yyyy-MM'))).reduce((s, e) => s + e.amount, 0)) + ' DA'} accent="green" icon={<Receipt className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="Depenses" value={filtered.length} accent="blue" icon={<Receipt className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Catégories" value={new Set(expenses.map(e => e.category)).size} accent="green" icon={<Receipt className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      {/* Filters + Add */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-immo-border-default">
          {([['month', 'Ce mois'], ['quarter', 'Trimestre'], ['year', 'Annee'], ['all', 'Tout']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPeriodFilter(k)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-medium ${periodFilter === k ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted hover:text-immo-text-primary'}`}>{l}</button>
          ))}
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="rounded-lg border border-immo-border-default bg-immo-bg-card px-3 py-1.5 text-xs text-immo-text-primary">
          <option value="all">Toutes categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <Button
          onClick={() => exportToCsv('depenses-marketing', filtered, [
            { header: 'Date', value: e => e.expense_date },
            { header: 'Catégorie', value: e => CATEGORIES.find(c => c.value === e.category)?.label ?? e.category },
            { header: 'Scope', value: e => SCOPE_LABELS[e.scope]?.label ?? e.scope },
            { header: 'Detail', value: e => e.subcategory ?? '' },
            { header: 'Projet', value: e => e.projects?.name ?? '' },
            { header: 'Campagne', value: e => e.marketing_campaigns?.name ?? '' },
            { header: 'Montant DZD', value: e => e.amount },
            { header: 'Notes', value: e => e.notes ?? '' },
          ])}
          variant="ghost"
          className="ml-auto text-xs text-immo-text-secondary"
          disabled={filtered.length === 0}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
        <Button onClick={() => setShowAdd(true)} className="bg-immo-accent-green text-white text-xs">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      {/* Chart — Evolution mensuelle par categorie */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Evolution des depenses — 6 mois</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--immo-text-muted, #8898AA)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--immo-text-muted, #8898AA)' }} width={60} tickFormatter={v => formatPriceCompact(v as number)} />
            <Tooltip contentStyle={{ background: 'var(--immo-bg-card, #fff)', border: '1px solid var(--immo-border-default, #E3E8EF)', borderRadius: 8, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {CATEGORIES.filter(c => (byCategory.find(b => b.value === c.value)?.total ?? 0) > 0).map(cat => (
              <Bar key={cat.value} dataKey={cat.label} stackId="a" fill={cat.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category breakdown */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {byCategory.filter(c => c.total > 0).map(cat => (
          <div key={cat.value} className="flex items-center gap-3 rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
            <div className="flex-1">
              <p className="text-xs text-immo-text-muted">{cat.label}</p>
              <p className="text-sm font-bold text-immo-text-primary">{formatPriceCompact(cat.total)} DA</p>
            </div>
            <span className="text-[10px] text-immo-text-muted">{totalSpent > 0 ? ((cat.total / totalSpent) * 100).toFixed(0) : 0}%</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-immo-border-default">
        <table className="w-full">
          <thead><tr className="bg-immo-bg-card-hover">
            {['Date', 'Catégorie', 'Scope', 'Detail', 'Projet / Campagne', 'Montant', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase text-immo-text-muted">{h}</th>
            ))}
          </tr></thead>
          <tbody className="divide-y divide-immo-border-default">
            {filtered.map(e => {
              const cat = CATEGORIES.find(c => c.value === e.category)
              const scope = SCOPE_LABELS[e.scope] ?? SCOPE_LABELS.agency_overhead
              const linkedTo = e.scope === 'campaign'
                ? (e.marketing_campaigns?.name ?? '—')
                : e.scope === 'project_overhead'
                  ? (e.projects?.name ?? '—')
                  : 'Frais généraux'
              return (
                <tr key={e.id} className="bg-immo-bg-card hover:bg-immo-bg-card-hover">
                  <td className="px-4 py-3 text-xs text-immo-text-secondary">{format(new Date(e.expense_date), 'dd/MM/yyyy')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: cat?.color }} />
                      <span className="text-xs text-immo-text-primary">{cat?.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: scope.color + '15', color: scope.color }}
                    >
                      {scope.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-immo-text-secondary">{e.subcategory ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-immo-text-muted">{linkedTo}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-immo-text-primary">{e.amount.toLocaleString('fr')} DA</td>
                  <td className="px-4 py-3">
                    <button onClick={() => deleteExpense.mutate(e.id)} className="text-immo-text-muted hover:text-immo-status-red"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="py-12 text-center text-sm text-immo-text-muted">Aucune depense enregistree</div>}
      </div>

      {/* Add Expense Modal */}
      {showAdd && <AddExpenseModal tenantId={tenantId!} projects={projects} campaigns={campaigns} onClose={() => setShowAdd(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['marketing-expenses'] }); setShowAdd(false) }} />}
    </div>
  )
}

function AddExpenseModal({ tenantId, projects, campaigns, onClose, onSaved }: {
  tenantId: string; projects: Array<{ id: string; name: string }>; campaigns: Array<{ id: string; name: string }>
  onClose: () => void; onSaved: () => void
}) {
  type Scope = 'campaign' | 'project_overhead' | 'agency_overhead'
  const [scope, setScope] = useState<Scope>('campaign')
  const [category, setCategory] = useState('ads_digital')
  const [subcategory, setSubcategory] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [projectId, setProjectId] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!amount || Number(amount) <= 0) { toast.error('Montant requis'); return }
    if (scope === 'campaign' && !campaignId) { toast.error('Sélectionnez une campagne'); return }
    if (scope === 'project_overhead' && !projectId) { toast.error('Sélectionnez un projet'); return }

    setSaving(true)
    const { error } = await supabase.from('marketing_expenses').insert({
      tenant_id: tenantId,
      scope,
      category,
      subcategory: subcategory || null,
      amount: Number(amount),
      expense_date: date,
      project_id: scope === 'project_overhead' ? projectId : null,
      campaign_id: scope === 'campaign' ? campaignId : null,
      notes: notes || null,
    } as never)
    setSaving(false)
    if (error) { toast.error(error.message ?? 'Erreur'); return }
    toast.success('Dépense ajoutée')
    onSaved()
  }

  return (
    <Modal isOpen onClose={onClose} title="Nouvelle dépense" size="sm">
      <div className="space-y-3">
        {/* Scope first — forces classification before anything else */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-immo-text-primary">À quoi cette dépense est-elle liée ?</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(SCOPE_LABELS) as Scope[]).map(s => {
              const def = SCOPE_LABELS[s]
              const active = scope === s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`rounded-lg border p-2.5 text-left transition-all ${
                    active
                      ? 'border-immo-accent-green/50 bg-immo-accent-green/5'
                      : 'border-immo-border-default hover:border-immo-text-muted'
                  }`}
                >
                  <p className={`text-[11px] font-semibold ${active ? 'text-immo-accent-green' : 'text-immo-text-primary'}`}>{def.label}</p>
                  <p className="mt-0.5 text-[9px] leading-tight text-immo-text-muted">{def.hint}</p>
                </button>
              )
            })}
          </div>
        </div>

        {scope === 'campaign' && (
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Campagne <span className="text-immo-status-red">*</span></label>
            <select value={campaignId} onChange={e => setCampaignId(e.target.value)} className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-xs text-immo-text-primary">
              <option value="">— Choisir —</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {campaigns.length === 0 && (
              <p className="mt-1 text-[10px] text-immo-status-orange">Aucune campagne — créez-en une dans l'onglet "Campagnes"</p>
            )}
          </div>
        )}
        {scope === 'project_overhead' && (
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Projet <span className="text-immo-status-red">*</span></label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-xs text-immo-text-primary">
              <option value="">— Choisir —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-immo-text-muted">Catégorie</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary">
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-immo-text-muted">Détail</label>
          <Input value={subcategory} onChange={e => setSubcategory(e.target.value)} placeholder="Ex : Vidéo drone Marina Bay" className="text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Montant (DA)</label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" className="text-sm" />
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
          <Save className="mr-1.5 h-4 w-4" /> {saving ? 'Enregistrement…' : 'Ajouter'}
        </Button>
      </div>
    </Modal>
  )
}
