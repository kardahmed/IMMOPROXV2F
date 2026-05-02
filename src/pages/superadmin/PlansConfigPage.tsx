import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { PageHeader, PageSkeleton } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { EconomicsSimulator } from './components/EconomicsSimulator'
import { MRRSimulator } from './components/MRRSimulator'
import { PlanCard, type PlanRow } from './components/PlanCard'
import { PlansComparisonGrid } from './components/PlansComparisonGrid'
import { useFeatureCatalog } from '@/hooks/useFeatureCatalog'

export function PlansConfigPage() {
  const qc = useQueryClient()
  const { data: catalog = [] } = useFeatureCatalog()

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plan-limits-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plan_limits').select('*').order('price_monthly')
      if (error) { handleSupabaseError(error); throw error }
      return (data as Array<Record<string, unknown>>).map(r => ({
        ...r,
        quota_ai_calls_monthly: typeof r.quota_ai_calls_monthly === 'number' ? r.quota_ai_calls_monthly : 0,
        quota_emails_monthly: typeof r.quota_emails_monthly === 'number' ? r.quota_emails_monthly : 0,
        quota_whatsapp_messages_monthly: typeof r.quota_whatsapp_messages_monthly === 'number' ? r.quota_whatsapp_messages_monthly : 0,
        quota_burst_per_hour: typeof r.quota_burst_per_hour === 'number' ? r.quota_burst_per_hour : 100,
        setup_fee_dzd: typeof r.setup_fee_dzd === 'number' ? r.setup_fee_dzd : 0,
      })) as unknown as PlanRow[]
    },
  })

  // Recompute estimated_cost_da_monthly + gross_margin_pct after a save.
  // Calls the SECURITY DEFINER RPC from migration 059 which iterates
  // every plan and re-sums the cost from feature_catalog.
  const recomputeMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('recompute_plan_costs' as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan-limits-config'] })
      qc.invalidateQueries({ queryKey: ['all-plans'] })
      toast.success('Coûts + marges recalculés')
    },
  })

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
      // Audit (HIGH): the previous version ran a sequential loop of
      // UPDATE queries from the browser. A failure mid-loop left
      // plan_limits in a half-saved state. The atomic RPC
      // (migration 051) wraps the whole batch in a single
      // transaction so it's all-or-nothing.
      const payload = editPlans.map(p => ({
        plan: p.plan,
        max_agents: p.max_agents,
        max_projects: p.max_projects,
        max_units: p.max_units,
        max_clients: p.max_clients,
        max_storage_mb: p.max_storage_mb,
        max_ai_tokens_monthly: p.max_ai_tokens_monthly,
        price_monthly: p.price_monthly,
        price_yearly: p.price_yearly,
        features: p.features,
        quota_ai_calls_monthly: p.quota_ai_calls_monthly ?? 0,
        quota_emails_monthly: p.quota_emails_monthly ?? 0,
        quota_whatsapp_messages_monthly: p.quota_whatsapp_messages_monthly ?? 0,
        quota_burst_per_hour: p.quota_burst_per_hour ?? 100,
        setup_fee_dzd: p.setup_fee_dzd ?? 0,
      }))
      const { error } = await supabase.rpc('save_plan_features_atomic' as never, { p_plans: payload } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['plan-limits'] })
      qc.invalidateQueries({ queryKey: ['plan-limits-config'] })
      qc.invalidateQueries({ queryKey: ['all-plans'] })
      setDirty(false)
      // Auto-recompute cost/margin after saving feature toggles + prices.
      // Best-effort — the explicit "Recalculer coûts" button covers the
      // failure case if this RPC ever errors.
      try {
        await supabase.rpc('recompute_plan_costs' as never)
      } catch { /* ignore */ }
      qc.invalidateQueries({ queryKey: ['plan-limits-config'] })
      toast.success('Plans mis à jour + coûts recalculés')
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

  if (isLoading || !plans) return <PageSkeleton kpiCount={0} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuration des plans"
        subtitle="Gerez les limites, tarifs et fonctionnalites de chaque plan"
        actions={
          <>
            <Button onClick={() => recomputeMutation.mutate()} disabled={recomputeMutation.isPending} className="border border-immo-border-default bg-transparent text-immo-text-secondary hover:bg-immo-bg-card-hover">
              <RefreshCw className={`mr-1.5 h-4 w-4 ${recomputeMutation.isPending ? 'animate-spin' : ''}`} /> Recalculer coûts
            </Button>
            <Button onClick={() => setShowAddPlan(true)} className="border border-immo-border-default bg-transparent text-immo-text-secondary hover:bg-immo-bg-card-hover">
              <Plus className="mr-1.5 h-4 w-4" /> Nouveau plan
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending} variant="purple">
              {saveMutation.isPending ? <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="mr-1.5 h-4 w-4" />}
              Enregistrer
            </Button>
          </>
        }
      />

      <EconomicsSimulator editPlans={editPlans} tenantCounts={tenantCounts} />
      <MRRSimulator editPlans={editPlans} tenantCounts={tenantCounts} />

      {showAddPlan && (
        <div className="rounded-xl border border-[#7C3AED]/30 bg-[#7C3AED]/5 p-4">
          <p className="mb-2 text-sm font-semibold text-[#7C3AED]">Nouveau plan</p>
          <div className="flex gap-2">
            <Input value={newPlanName} onChange={e => setNewPlanName(e.target.value)} placeholder="Nom du plan (ex: premium)" className="w-[200px] border-immo-border-default bg-immo-bg-card text-sm" />
            <Button onClick={() => addPlanMutation.mutate()} disabled={!newPlanName || addPlanMutation.isPending} variant="purple">Ajouter</Button>
            <Button onClick={() => setShowAddPlan(false)} className="border border-immo-border-default bg-transparent text-immo-text-secondary">Annuler</Button>
          </div>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {editPlans.map((plan, idx) => (
          <PlanCard
            key={plan.plan}
            plan={plan}
            index={idx}
            count={tenantCounts.get(plan.plan) ?? 0}
            // Plan deletion is gated by tenant count in the RPC; no
            // need to hardcode "protected" slugs anymore. Keep the
            // delete button hidden only when tenants are using the
            // plan to avoid an obvious data-loss footgun.
            isProtected={(tenantCounts.get(plan.plan) ?? 0) > 0}
            catalog={catalog}
            onUpdate={updatePlan}
            onToggleFeature={toggleFeature}
            onDelete={(p) => deletePlanMutation.mutate(p)}
            isDeleting={deletePlanMutation.isPending}
          />
        ))}
      </div>

      <PlansComparisonGrid editPlans={editPlans} tenantCounts={tenantCounts} catalog={catalog} />
    </div>
  )
}
