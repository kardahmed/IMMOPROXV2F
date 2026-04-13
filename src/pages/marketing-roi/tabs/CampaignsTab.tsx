import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Megaphone, Calendar, Pause, Play, Check, Trash2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { LoadingSpinner, StatusBadge, Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPriceCompact } from '@/lib/constants'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

const SOURCE_OPTIONS = [
  'facebook_ads', 'google_ads', 'instagram_ads', 'tiktok_ads', 'print', 'event', 'other',
]

interface Campaign {
  id: string; name: string; source: string; start_date: string; end_date: string | null
  planned_budget: number; target_leads: number; status: string; notes: string | null
  project_id: string | null; projects?: { name: string } | null
}

export function CampaignsTab() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['marketing-campaigns', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('marketing_campaigns').select('*, projects(name)').eq('tenant_id', tenantId!).order('start_date', { ascending: false })
      return (data ?? []) as unknown as Campaign[]
    },
    enabled: !!tenantId,
  })

  // Calculate KPIs per campaign from expenses + clients
  const { data: kpis = new Map() } = useQuery({
    queryKey: ['campaign-kpis', tenantId],
    queryFn: async () => {
      const [expensesRes, clientsRes, salesRes] = await Promise.all([
        supabase.from('marketing_expenses').select('campaign_id, amount').eq('tenant_id', tenantId!).not('campaign_id', 'is', null),
        supabase.from('clients').select('id, source, created_at').eq('tenant_id', tenantId!),
        supabase.from('sales').select('id, client_id, final_price').eq('tenant_id', tenantId!).eq('status', 'active'),
      ])
      const expenses = (expensesRes.data ?? []) as Array<{ campaign_id: string; amount: number }>
      const clients = (clientsRes.data ?? []) as Array<{ id: string; source: string; created_at: string }>
      const sales = (salesRes.data ?? []) as Array<{ id: string; client_id: string; final_price: number }>

      const map = new Map<string, { spent: number; leads: number; sales: number; revenue: number }>()
      for (const e of expenses) {
        if (!map.has(e.campaign_id)) map.set(e.campaign_id, { spent: 0, leads: 0, sales: 0, revenue: 0 })
        map.get(e.campaign_id)!.spent += e.amount
      }
      return map
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
    mutationFn: async (id: string) => { await supabase.from('marketing_campaigns').delete().eq('id', id) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); toast.success('Campagne supprimee') },
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  const STATUS_MAP: Record<string, { label: string; type: 'green' | 'orange' | 'muted' }> = {
    active: { label: 'Active', type: 'green' },
    paused: { label: 'En pause', type: 'orange' },
    completed: { label: 'Terminee', type: 'muted' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-immo-text-muted">{campaigns.length} campagne(s)</p>
        <Button onClick={() => setShowCreate(true)} className="bg-immo-accent-green text-white text-xs">
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nouvelle campagne
        </Button>
      </div>

      {/* Campaign cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.map(c => {
          const st = STATUS_MAP[c.status] ?? STATUS_MAP.active
          const data = kpis.get(c.id)
          const spent = data?.spent ?? 0
          const budgetPct = c.planned_budget > 0 ? (spent / c.planned_budget) * 100 : 0

          return (
            <div key={c.id} className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
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
                    </div>
                  </div>
                </div>
                <StatusBadge label={st.label} type={st.type} />
              </div>

              {/* Dates */}
              <div className="flex items-center gap-2 mb-3 text-[10px] text-immo-text-muted">
                <Calendar className="h-3 w-3" />
                {format(new Date(c.start_date), 'dd/MM/yyyy')}
                {c.end_date && <> → {format(new Date(c.end_date), 'dd/MM/yyyy')}</>}
              </div>

              {/* Budget bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-immo-text-muted">Budget</span>
                  <span className="font-semibold text-immo-text-primary">
                    {formatPriceCompact(spent)} / {formatPriceCompact(c.planned_budget)} DA
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-immo-bg-primary">
                  <div className={`h-full rounded-full ${budgetPct > 90 ? 'bg-immo-status-red' : budgetPct > 70 ? 'bg-immo-status-orange' : 'bg-immo-accent-green'}`} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg bg-immo-bg-primary p-2 text-center">
                  <p className="text-xs font-bold text-immo-accent-blue">{data?.leads ?? 0}</p>
                  <p className="text-[8px] text-immo-text-muted">Leads</p>
                </div>
                <div className="rounded-lg bg-immo-bg-primary p-2 text-center">
                  <p className="text-xs font-bold text-immo-accent-green">{data?.sales ?? 0}</p>
                  <p className="text-[8px] text-immo-text-muted">Ventes</p>
                </div>
                <div className="rounded-lg bg-immo-bg-primary p-2 text-center">
                  <p className="text-xs font-bold text-immo-text-primary">{formatPriceCompact(data?.revenue ?? 0)}</p>
                  <p className="text-[8px] text-immo-text-muted">CA</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1.5">
                {c.status === 'active' && (
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus.mutate({ id: c.id, status: 'paused' })}
                    className="h-7 flex-1 border border-immo-status-orange/30 text-[10px] text-immo-status-orange hover:bg-immo-status-orange/5">
                    <Pause className="mr-1 h-3 w-3" /> Pause
                  </Button>
                )}
                {c.status === 'paused' && (
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus.mutate({ id: c.id, status: 'active' })}
                    className="h-7 flex-1 border border-immo-accent-green/30 text-[10px] text-immo-accent-green hover:bg-immo-accent-green/5">
                    <Play className="mr-1 h-3 w-3" /> Reprendre
                  </Button>
                )}
                {c.status !== 'completed' && (
                  <Button size="sm" variant="ghost" onClick={() => toggleStatus.mutate({ id: c.id, status: 'completed' })}
                    className="h-7 flex-1 border border-immo-border-default text-[10px] text-immo-text-muted hover:bg-immo-bg-card-hover">
                    <Check className="mr-1 h-3 w-3" /> Terminer
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => deleteCampaign.mutate(c.id)}
                  className="h-7 border border-immo-status-red/20 text-[10px] text-immo-status-red hover:bg-immo-status-red/5">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {campaigns.length === 0 && (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card py-16 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-immo-text-muted/30 mb-3" />
          <p className="text-sm text-immo-text-muted">Aucune campagne</p>
          <p className="text-xs text-immo-text-muted mt-1">Creez votre premiere campagne pour suivre son ROI</p>
        </div>
      )}

      {/* Create modal */}
      {showCreate && <CreateCampaignModal tenantId={tenantId!} onClose={() => setShowCreate(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); setShowCreate(false) }} />}
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
  const [saving, setSaving] = useState(false)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-simple', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('tenant_id', tenantId).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })
  const [projectId, setProjectId] = useState('')

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
    toast.success('Campagne creee')
    onSaved()
  }

  return (
    <Modal isOpen onClose={onClose} title="Nouvelle campagne" size="sm">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-immo-text-muted">Nom</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Campagne Facebook Ramadan 2026" className="text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Source</label>
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
