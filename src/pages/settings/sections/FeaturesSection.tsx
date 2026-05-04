import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, DollarSign, FileText, Target, Globe, Sparkles, MessageCircle, Zap, Receipt, Lock, Cpu, Download, Palette, Key, BarChart3 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

// Map feature toggle key → plan_limits.features key. Every plan-level
// feature has a tenant override here so the agency admin can disable
// what their plan allows. Must stay in sync with TENANT_COLUMN in
// src/hooks/useFeatureAccess.ts and supabase/functions/_shared/checkPlanFeature.ts.
const FEATURES = [
  // Modules (core CRM capabilities)
  { key: 'feature_payment_tracking', label: 'Suivi des echeanciers', desc: 'Gestion des paiements, echeanciers, relances de retard', icon: DollarSign, color: 'text-immo-accent-green', planFeature: 'payment_tracking' },
  { key: 'feature_charges', label: 'Charges & frais', desc: 'Frais notaire, agence, enregistrement par dossier', icon: Receipt, color: 'text-immo-status-orange', planFeature: 'charges' },
  { key: 'feature_documents', label: 'Generation de documents', desc: 'Contrats, echeanciers, bons de reservation en PDF', icon: FileText, color: 'text-immo-accent-blue', planFeature: 'pdf_generation' },
  { key: 'feature_goals', label: 'Objectifs de vente', desc: 'Objectifs mensuels/trimestriels par agent', icon: Target, color: 'text-blue-500', planFeature: 'goals' },
  { key: 'feature_landing_pages', label: 'Pages de capture', desc: 'Landing pages pour vos campagnes publicitaires', icon: Globe, color: 'text-immo-accent-blue', planFeature: 'landing_pages' },
  { key: 'feature_whatsapp', label: 'WhatsApp Business', desc: 'Envoi automatique de messages WhatsApp aux clients', icon: MessageCircle, color: 'text-green-500', planFeature: 'whatsapp' },
  { key: 'feature_auto_tasks', label: 'Taches automatiques', desc: 'Generation et suivi automatique des taches par etape', icon: Zap, color: 'text-immo-status-orange', planFeature: 'auto_tasks' },
  { key: 'feature_roi_marketing', label: 'ROI Marketing', desc: 'Analyse du ROI des campagnes et budgets publicitaires', icon: BarChart3, color: 'text-immo-accent-green', planFeature: 'roi_marketing' },

  // IA (intelligence artificielle)
  { key: 'feature_ai_scripts', label: 'Scripts d\'appel IA', desc: 'Generation de scripts personnalises par intelligence artificielle', icon: Sparkles, color: 'text-blue-500', planFeature: 'ai_scripts' },
  { key: 'feature_ai_suggestions', label: 'Suggestions IA', desc: 'Recommandation d\'unites pertinentes pour chaque client', icon: Sparkles, color: 'text-blue-500', planFeature: 'ai_suggestions' },
  { key: 'feature_ai_documents', label: 'Documents IA', desc: 'Generation de documents personnalises par IA', icon: FileText, color: 'text-blue-500', planFeature: 'ai_documents' },
  { key: 'feature_ai_custom', label: 'IA personnalisee', desc: 'Prompts IA sur mesure pour votre agence', icon: Cpu, color: 'text-blue-500', planFeature: 'ai_custom' },

  // Outils (transverse)
  { key: 'feature_export_csv', label: 'Export CSV', desc: 'Export des donnees (pipeline, clients, paiements) en CSV', icon: Download, color: 'text-immo-text-muted', planFeature: 'export_csv' },
  { key: 'feature_custom_branding', label: 'Branding personnalise', desc: 'Logo, couleurs et typographie personnalises', icon: Palette, color: 'text-immo-accent-blue', planFeature: 'custom_branding' },
  { key: 'feature_api_access', label: 'Acces API', desc: 'Integrations externes et webhooks', icon: Key, color: 'text-immo-text-muted', planFeature: 'api_access' },
] as const

type FeatureKey = typeof FEATURES[number]['key']

const PLAN_LABELS: Record<string, string> = { free: 'Free', starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' }

export function FeaturesSection() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()

  // Get tenant plan
  const { data: tenantPlan } = useQuery({
    queryKey: ['tenant-plan', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('plan').eq('id', tenantId!).single()
      return data?.plan ?? 'free'
    },
    enabled: !!tenantId,
  })

  // Get plan features
  const { data: planFeatures } = useQuery({
    queryKey: ['plan-features', tenantPlan],
    queryFn: async () => {
      const { data } = await supabase.from('plan_limits').select('features').eq('plan', tenantPlan!).single()
      return (data?.features as Record<string, boolean> | null) ?? {}
    },
    enabled: !!tenantPlan,
  })

  const SELECT_COLS = FEATURES.map(f => f.key).join(', ')
  const DEFAULT_FEATURES = Object.fromEntries(FEATURES.map(f => [f.key, true])) as Record<FeatureKey, boolean>

  const { data: settings } = useQuery({
    queryKey: ['tenant-features', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings')
        .select(SELECT_COLS as never)
        .eq('tenant_id', tenantId!)
        .single()
      return data as unknown as Record<FeatureKey, boolean> | null
    },
    enabled: !!tenantId,
  })

  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>(DEFAULT_FEATURES)

  useEffect(() => {
    if (settings) {
      setFeatures(
        Object.fromEntries(
          FEATURES.map(f => [f.key, settings[f.key] ?? true])
        ) as Record<FeatureKey, boolean>
      )
    }
  }, [settings])

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tenant_settings').update(features).eq('tenant_id', tenantId!)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-features'] }); toast.success('Fonctionnalités mises à jour') },
    onError: (err: Error) => toast.error(err.message),
  })

  // Check if a feature is allowed by the current plan (reads from plan_limits.features configured by super admin)
  function isAllowedByPlan(feat: typeof FEATURES[number]): boolean {
    if (!feat.planFeature) return true
    if (!planFeatures) return true // Loading, show as allowed
    return planFeatures[feat.planFeature] === true
  }

  function toggle(key: FeatureKey) {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const activeCount = FEATURES.filter(f => isAllowedByPlan(f) && features[f.key]).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-immo-text-primary">Fonctionnalites</h2>
        <p className="text-xs text-immo-text-muted">
          Activez ou desactivez les modules selon les besoins de votre agence ({activeCount}/{FEATURES.length} actifs)
          {tenantPlan && <span className="ms-2 rounded-full bg-immo-accent-blue/10 px-2 py-0.5 text-[10px] font-semibold text-immo-accent-blue">Plan {PLAN_LABELS[tenantPlan] ?? tenantPlan}</span>}
        </p>
      </div>

      <div className="space-y-3">
        {FEATURES.map(feat => {
          const Icon = feat.icon
          const allowed = isAllowedByPlan(feat)
          const isOn = allowed && features[feat.key]

          return (
            <div key={feat.key} className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
              !allowed ? 'border-immo-border-default/30 bg-immo-bg-primary opacity-50' :
              isOn ? 'border-immo-border-default bg-immo-bg-card' : 'border-immo-border-default/50 bg-immo-bg-primary opacity-70'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isOn ? 'bg-immo-bg-card-hover' : 'bg-immo-bg-primary'}`}>
                  {allowed ? (
                    <Icon className={`h-4 w-4 ${isOn ? feat.color : 'text-immo-text-muted'}`} />
                  ) : (
                    <Lock className="h-4 w-4 text-immo-text-muted" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${isOn ? 'text-immo-text-primary' : 'text-immo-text-muted'}`}>{feat.label}</p>
                    {!allowed && (
                      <span className="rounded-full bg-immo-status-orange/10 px-2 py-0.5 text-[9px] font-bold text-immo-status-orange">
                        Non inclus dans votre plan
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-immo-text-muted">{feat.desc}</p>
                </div>
              </div>
              {allowed ? (
                <button
                  onClick={() => toggle(feat.key)}
                  className={`relative h-6 w-11 rounded-full transition-all ${isOn ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`}
                >
                  <div className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                    style={{ left: isOn ? '22px' : '2px' }} />
                </button>
              ) : (
                <div className="flex items-center gap-1.5 text-[10px] text-immo-text-muted">
                  <Lock className="h-3 w-3" />
                  <a href="/settings" className="text-immo-accent-blue hover:underline">Upgrader</a>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-immo-accent-green text-white text-xs hover:bg-immo-accent-green/90">
        <Save className="me-1.5 h-4 w-4" /> {save.isPending ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </div>
  )
}
