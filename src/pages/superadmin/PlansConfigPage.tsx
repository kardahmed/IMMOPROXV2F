import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Users, Building2, Home, Briefcase, HardDrive, Cpu, DollarSign, Check, X, Zap, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { LoadingSpinner } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

/* ═══ Types ═══ */

interface PlanRow {
  plan: string
  max_agents: number
  max_projects: number
  max_units: number
  max_clients: number
  max_storage_mb: number
  max_ai_tokens_monthly: number
  price_monthly: number
  price_yearly: number
  features: Record<string, boolean>
}

const FEATURE_LABELS: Record<string, { label: string; icon: typeof Cpu }> = {
  // IA
  ai_suggestions: { label: 'Suggestions IA', icon: Zap },
  ai_scripts: { label: 'Scripts appel IA', icon: Cpu },
  ai_documents: { label: 'Documents IA', icon: Cpu },
  ai_custom: { label: 'IA personnalisee', icon: Cpu },
  // Outils
  export_csv: { label: 'Export CSV', icon: HardDrive },
  pdf_generation: { label: 'Generation PDF', icon: HardDrive },
  custom_branding: { label: 'Branding custom', icon: HardDrive },
  api_access: { label: 'Acces API', icon: Zap },
  // Modules (correspond aux toggles tenant)
  landing_pages: { label: 'Pages de capture', icon: Building2 },
  whatsapp: { label: 'WhatsApp Business', icon: Zap },
  payment_tracking: { label: 'Suivi echeanciers', icon: DollarSign },
  auto_tasks: { label: 'Taches automatiques', icon: Zap },
  goals: { label: 'Objectifs de vente', icon: Briefcase },
  charges: { label: 'Charges & frais', icon: DollarSign },
}

const ALL_FEATURES = Object.keys(FEATURE_LABELS)

const PLAN_COLORS: Record<string, string> = {
  free: '#8898AA',
  starter: '#0579DA',
  pro: '#7C3AED',
  enterprise: '#F5A623',
}

function formatTokens(tokens: number): string {
  if (tokens === -1) return 'Illimite'
  if (tokens === 0) return 'Aucun'
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
  return String(tokens)
}

function formatPrice(da: number): string {
  if (da === 0) return 'Gratuit'
  return `${da.toLocaleString('fr-FR')} DA`
}

/* ═══ Component ═══ */

export function PlansConfigPage() {
  const qc = useQueryClient()

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plan-limits-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plan_limits').select('*').order('price_monthly')
      if (error) { handleSupabaseError(error); throw error }
      return data as PlanRow[]
    },
  })

  // Count tenants per plan
  const { data: tenantCounts = new Map<string, number>() } = useQuery({
    queryKey: ['tenant-plan-counts'],
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('plan' as never)
      const map = new Map<string, number>()
      for (const t of (data ?? []) as unknown as Array<{ plan: string | null }>) {
        const p = t.plan ?? 'free'
        map.set(p, (map.get(p) ?? 0) + 1)
      }
      return map
    },
  })

  // Editable state
  const [editPlans, setEditPlans] = useState<PlanRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [showAddPlan, setShowAddPlan] = useState(false)
  const [newPlanName, setNewPlanName] = useState('')

  useEffect(() => {
    if (plans) { setEditPlans(plans.map(p => ({ ...p, features: { ...p.features } }))); setDirty(false) }
  }, [plans])

  function updatePlan(index: number, field: keyof PlanRow, value: unknown) {
    setEditPlans(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
    setDirty(true)
  }

  function toggleFeature(index: number, feature: string) {
    setEditPlans(prev => {
      const next = [...prev]
      const features = { ...next[index].features }
      features[feature] = !features[feature]
      next[index] = { ...next[index], features }
      return next
    })
    setDirty(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const p of editPlans) {
        const { error } = await supabase.from('plan_limits').update({
          max_agents: p.max_agents,
          max_projects: p.max_projects,
          max_units: p.max_units,
          max_clients: p.max_clients,
          max_storage_mb: p.max_storage_mb,
          max_ai_tokens_monthly: p.max_ai_tokens_monthly,
          price_monthly: p.price_monthly,
          price_yearly: p.price_yearly,
          features: p.features,
        } as never).eq('plan', p.plan)
        if (error) { handleSupabaseError(error); throw error }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan-limits'] })
      qc.invalidateQueries({ queryKey: ['plan-limits-config'] })
      setDirty(false)
      toast.success('Plans mis à jour')
    },
  })

  const addPlanMutation = useMutation({
    mutationFn: async () => {
      const slug = newPlanName.toLowerCase().replace(/[^a-z0-9]/g, '_')
      const { error } = await supabase.from('plan_limits').insert({
        plan: slug,
        max_agents: 5,
        max_projects: 3,
        max_units: 100,
        max_clients: 200,
        max_storage_mb: 500,
        max_ai_tokens_monthly: 100000,
        price_monthly: 9900,
        features: { ai_suggestions: true, export_csv: true, pdf_generation: true },
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan-limits-config'] })
      setShowAddPlan(false)
      setNewPlanName('')
      toast.success('Plan ajouté')
    },
  })

  const deletePlanMutation = useMutation({
    mutationFn: async (plan: string) => {
      // Check no tenant uses this plan
      const count = tenantCounts.get(plan) ?? 0
      if (count > 0) throw new Error(`${count} tenant(s) utilisent ce plan`)
      const { error } = await supabase.from('plan_limits').delete().eq('plan', plan)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan-limits-config'] })
      toast.success('Plan supprimé')
    },
    onError: (e) => toast.error((e as Error).message),
  })

  if (isLoading || !plans) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-immo-text-primary">Configuration des plans</h1>
          <p className="text-sm text-immo-text-secondary">Gerez les limites, tarifs et fonctionnalites de chaque plan</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddPlan(true)} className="border border-immo-border-default bg-transparent text-immo-text-secondary hover:bg-immo-bg-card-hover">
            <Plus className="mr-1.5 h-4 w-4" /> Nouveau plan
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending} className="bg-[#7C3AED] font-semibold text-white hover:bg-[#6D28D9] disabled:opacity-50">
            {saveMutation.isPending ? <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="mr-1.5 h-4 w-4" />}
            Enregistrer
          </Button>
        </div>
      </div>

      {/* Add plan modal */}
      {showAddPlan && (
        <div className="rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/5 p-4">
          <p className="mb-2 text-sm font-semibold text-[#7C3AED]">Nouveau plan</p>
          <div className="flex gap-2">
            <Input value={newPlanName} onChange={e => setNewPlanName(e.target.value)} placeholder="Nom du plan (ex: premium)" className="w-[200px] border-immo-border-default bg-immo-bg-card text-sm" />
            <Button onClick={() => addPlanMutation.mutate()} disabled={!newPlanName || addPlanMutation.isPending} className="bg-[#7C3AED] text-white">Ajouter</Button>
            <Button onClick={() => setShowAddPlan(false)} className="border border-immo-border-default bg-transparent text-immo-text-secondary">Annuler</Button>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {editPlans.map((plan, idx) => {
          const color = PLAN_COLORS[plan.plan] ?? '#0579DA'
          const count = tenantCounts.get(plan.plan) ?? 0
          const isProtected = ['free', 'starter', 'pro', 'enterprise'].includes(plan.plan)

          return (
            <div key={plan.plan} className="rounded-xl border border-immo-border-default bg-immo-bg-card overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-immo-border-default" style={{ backgroundColor: color + '10' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold capitalize" style={{ color }}>{plan.plan}</h3>
                    <p className="text-[10px] text-immo-text-muted">{count} tenant{count > 1 ? 's' : ''}</p>
                  </div>
                  {!isProtected && (
                    <button onClick={() => deletePlanMutation.mutate(plan.plan)} disabled={deletePlanMutation.isPending}
                      className="rounded-lg p-1 text-immo-text-muted hover:bg-immo-status-red/10 hover:text-immo-status-red">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Price */}
                <div>
                  <Label className="text-[10px] font-medium text-immo-text-muted flex items-center gap-1"><DollarSign className="h-3 w-3" /> Prix mensuel (DA)</Label>
                  <Input type="number" value={plan.price_monthly} onChange={e => updatePlan(idx, 'price_monthly', parseInt(e.target.value) || 0)}
                    className="mt-1 h-8 border-immo-border-default bg-immo-bg-primary text-sm text-immo-text-primary" />
                  <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatPrice(plan.price_monthly)}</p>
                </div>
                <div>
                  <Label className="text-[10px] font-medium text-immo-text-muted flex items-center gap-1"><DollarSign className="h-3 w-3" /> Prix annuel (DA)</Label>
                  <Input type="number" value={plan.price_yearly} onChange={e => updatePlan(idx, 'price_yearly', parseInt(e.target.value) || 0)}
                    className="mt-1 h-8 border-immo-border-default bg-immo-bg-primary text-sm text-immo-text-primary" />
                  <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatPrice(plan.price_yearly)}/an {plan.price_monthly > 0 ? `(${Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100)}% economie)` : ''}</p>
                </div>

                {/* Limits */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">Limites</p>

                  <div>
                    <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Users className="h-3 w-3" /> Max agents</Label>
                    <Input type="number" value={plan.max_agents} onChange={e => updatePlan(idx, 'max_agents', parseInt(e.target.value) || 0)}
                      className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
                  </div>

                  <div>
                    <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Building2 className="h-3 w-3" /> Max projets</Label>
                    <Input type="number" value={plan.max_projects} onChange={e => updatePlan(idx, 'max_projects', parseInt(e.target.value) || 0)}
                      className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
                  </div>

                  <div>
                    <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Home className="h-3 w-3" /> Max unites</Label>
                    <Input type="number" value={plan.max_units} onChange={e => updatePlan(idx, 'max_units', parseInt(e.target.value) || 0)}
                      className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
                  </div>

                  <div>
                    <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Briefcase className="h-3 w-3" /> Max clients</Label>
                    <Input type="number" value={plan.max_clients} onChange={e => updatePlan(idx, 'max_clients', parseInt(e.target.value) || 0)}
                      className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
                  </div>

                  <div>
                    <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><HardDrive className="h-3 w-3" /> Stockage (MB)</Label>
                    <Input type="number" value={plan.max_storage_mb} onChange={e => updatePlan(idx, 'max_storage_mb', parseInt(e.target.value) || 0)}
                      className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
                  </div>

                  <div>
                    <Label className="text-[10px] text-immo-text-muted flex items-center gap-1"><Cpu className="h-3 w-3" /> Tokens IA / mois</Label>
                    <Input type="number" value={plan.max_ai_tokens_monthly} onChange={e => updatePlan(idx, 'max_ai_tokens_monthly', parseInt(e.target.value) || 0)}
                      className="mt-0.5 h-7 border-immo-border-default bg-immo-bg-primary text-xs text-immo-text-primary" />
                    <p className="mt-0.5 text-[10px] text-immo-text-muted">{formatTokens(plan.max_ai_tokens_monthly)} {plan.max_ai_tokens_monthly === -1 && '(-1 = illimite)'}</p>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">Fonctionnalites</p>
                  {ALL_FEATURES.map(f => {
                    const enabled = plan.features[f] === true
                    return (
                      <button key={f} onClick={() => toggleFeature(idx, f)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${enabled ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted hover:bg-immo-bg-card-hover'}`}>
                        {enabled ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                        {FEATURE_LABELS[f]?.label ?? f}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary table */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card overflow-hidden">
        <div className="border-b border-immo-border-default px-5 py-3">
          <h3 className="text-sm font-semibold text-immo-text-primary">Grille comparative</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-immo-border-default bg-immo-bg-primary">
                <th className="px-4 py-2 text-left text-[11px] font-medium text-immo-text-muted">Critere</th>
                {editPlans.map(p => (
                  <th key={p.plan} className="px-4 py-2 text-center text-[11px] font-bold capitalize" style={{ color: PLAN_COLORS[p.plan] ?? '#0579DA' }}>
                    {p.plan}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-immo-border-default">
              <tr>
                <td className="px-4 py-2 text-immo-text-secondary">Prix</td>
                {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center font-medium text-immo-text-primary">{formatPrice(p.price_monthly)}</td>)}
              </tr>
              <tr>
                <td className="px-4 py-2 text-immo-text-secondary">Agents</td>
                {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_agents >= 999 ? '∞' : p.max_agents}</td>)}
              </tr>
              <tr>
                <td className="px-4 py-2 text-immo-text-secondary">Projets</td>
                {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_projects >= 999 ? '∞' : p.max_projects}</td>)}
              </tr>
              <tr>
                <td className="px-4 py-2 text-immo-text-secondary">Unites</td>
                {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_units >= 9999 ? '∞' : p.max_units}</td>)}
              </tr>
              <tr>
                <td className="px-4 py-2 text-immo-text-secondary">Clients</td>
                {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_clients >= 9999 ? '∞' : p.max_clients}</td>)}
              </tr>
              <tr>
                <td className="px-4 py-2 text-immo-text-secondary">Stockage</td>
                {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center text-immo-text-primary">{p.max_storage_mb >= 10000 ? '∞' : `${p.max_storage_mb} MB`}</td>)}
              </tr>
              <tr className="bg-[#7C3AED]/5">
                <td className="px-4 py-2 font-medium text-[#7C3AED]">Tokens IA / mois</td>
                {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center font-semibold text-[#7C3AED]">{formatTokens(p.max_ai_tokens_monthly)}</td>)}
              </tr>
              {ALL_FEATURES.map(f => (
                <tr key={f}>
                  <td className="px-4 py-2 text-immo-text-secondary">{FEATURE_LABELS[f]?.label ?? f}</td>
                  {editPlans.map(p => (
                    <td key={p.plan} className="px-4 py-2 text-center">
                      {p.features[f] ? <Check className="mx-auto h-4 w-4 text-immo-accent-green" /> : <X className="mx-auto h-4 w-4 text-immo-text-muted/40" />}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-immo-bg-primary">
                <td className="px-4 py-2 font-medium text-immo-text-primary">Tenants actifs</td>
                {editPlans.map(p => <td key={p.plan} className="px-4 py-2 text-center font-bold text-immo-text-primary">{tenantCounts.get(p.plan) ?? 0}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
