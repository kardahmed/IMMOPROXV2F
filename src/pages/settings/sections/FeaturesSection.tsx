import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, DollarSign, FileText, Target, Globe, Sparkles, MessageCircle, Zap, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

const FEATURES = [
  { key: 'feature_payment_tracking', label: 'Suivi des echeanciers', desc: 'Gestion des paiements, echeanciers, relances de retard', icon: DollarSign, color: 'text-immo-accent-green' },
  { key: 'feature_charges', label: 'Charges & frais', desc: 'Frais notaire, agence, enregistrement par dossier', icon: Receipt, color: 'text-immo-status-orange' },
  { key: 'feature_documents', label: 'Generation de documents', desc: 'Contrats, echeanciers, bons de reservation en PDF', icon: FileText, color: 'text-immo-accent-blue' },
  { key: 'feature_goals', label: 'Objectifs de vente', desc: 'Objectifs mensuels/trimestriels par agent', icon: Target, color: 'text-purple-500' },
  { key: 'feature_landing_pages', label: 'Pages de capture', desc: 'Landing pages pour vos campagnes publicitaires', icon: Globe, color: 'text-immo-accent-blue' },
  { key: 'feature_ai_scripts', label: 'Scripts d\'appel IA', desc: 'Generation de scripts personnalises par intelligence artificielle', icon: Sparkles, color: 'text-purple-500' },
  { key: 'feature_whatsapp', label: 'WhatsApp Business', desc: 'Envoi automatique de messages WhatsApp aux clients', icon: MessageCircle, color: 'text-green-500' },
  { key: 'feature_auto_tasks', label: 'Taches automatiques', desc: 'Generation et suivi automatique des taches par etape', icon: Zap, color: 'text-immo-status-orange' },
] as const

type FeatureKey = typeof FEATURES[number]['key']

export function FeaturesSection() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['tenant-features', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings')
        .select('feature_payment_tracking, feature_charges, feature_documents, feature_goals, feature_landing_pages, feature_ai_scripts, feature_whatsapp, feature_auto_tasks' as never)
        .eq('tenant_id', tenantId!)
        .single()
      return data as unknown as Record<FeatureKey, boolean> | null
    },
    enabled: !!tenantId,
  })

  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>({
    feature_payment_tracking: true,
    feature_charges: true,
    feature_documents: true,
    feature_goals: true,
    feature_landing_pages: true,
    feature_ai_scripts: true,
    feature_whatsapp: true,
    feature_auto_tasks: true,
  })

  useEffect(() => {
    if (settings) {
      setFeatures({
        feature_payment_tracking: settings.feature_payment_tracking ?? true,
        feature_charges: settings.feature_charges ?? true,
        feature_documents: settings.feature_documents ?? true,
        feature_goals: settings.feature_goals ?? true,
        feature_landing_pages: settings.feature_landing_pages ?? true,
        feature_ai_scripts: settings.feature_ai_scripts ?? true,
        feature_whatsapp: settings.feature_whatsapp ?? true,
        feature_auto_tasks: settings.feature_auto_tasks ?? true,
      })
    }
  }, [settings])

  const save = useMutation({
    mutationFn: async () => {
      await supabase.from('tenant_settings').update(features as never).eq('tenant_id', tenantId!)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-features'] }); toast.success('Fonctionnalites mises a jour') },
  })

  function toggle(key: FeatureKey) {
    setFeatures(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const activeCount = Object.values(features).filter(Boolean).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-immo-text-primary">Fonctionnalites</h2>
        <p className="text-xs text-immo-text-muted">Activez ou desactivez les modules selon les besoins de votre agence ({activeCount}/{FEATURES.length} actifs)</p>
      </div>

      <div className="space-y-3">
        {FEATURES.map(feat => {
          const Icon = feat.icon
          const isOn = features[feat.key]
          return (
            <div key={feat.key} className={`flex items-center justify-between rounded-xl border p-4 transition-all ${isOn ? 'border-immo-border-default bg-immo-bg-card' : 'border-immo-border-default/50 bg-immo-bg-primary opacity-60'}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isOn ? 'bg-immo-bg-card-hover' : 'bg-immo-bg-primary'}`}>
                  <Icon className={`h-4 w-4 ${isOn ? feat.color : 'text-immo-text-muted'}`} />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isOn ? 'text-immo-text-primary' : 'text-immo-text-muted'}`}>{feat.label}</p>
                  <p className="text-[11px] text-immo-text-muted">{feat.desc}</p>
                </div>
              </div>
              <button
                onClick={() => toggle(feat.key)}
                className={`relative h-6 w-11 rounded-full transition-all ${isOn ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`}
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${isOn ? 'left-5.5 translate-x-0' : 'left-0.5'}`}
                  style={{ left: isOn ? '22px' : '2px' }} />
              </button>
            </div>
          )
        })}
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-immo-accent-green text-white text-xs hover:bg-immo-accent-green/90">
        <Save className="mr-1.5 h-4 w-4" /> {save.isPending ? 'Enregistrement...' : 'Enregistrer'}
      </Button>
    </div>
  )
}
