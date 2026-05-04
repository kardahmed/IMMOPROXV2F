import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Info, Sparkles, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Card, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'

const STAGE_ORDER: PipelineStage[] = [
  'accueil', 'visite_a_gerer', 'visite_confirmee', 'visite_terminee',
  'negociation', 'reservation', 'vente', 'relancement', 'perdue',
]

const STAGE_HINTS: Record<PipelineStage, string> = {
  accueil: 'Premier contact. Ex: "Toujours commencer par le prénom du client. Demander la source du lead."',
  visite_a_gerer: 'Caler la visite. Ex: "Proposer 3 créneaux entre 10h-12h ou 15h-17h."',
  visite_confirmee: 'Rappel J-1. Ex: "Rappeler la veille à 17h. Préciser le code de l\'immeuble."',
  visite_terminee: 'Feedback à chaud. Ex: "Demander note sur 5. Si > 4 → proposer réservation."',
  negociation: 'Lever objections. Ex: "Marge négociable jusqu\'à -3%. Validation admin si > 5%."',
  reservation: 'Sécuriser le dépôt. Ex: "Confirmer reçu acompte. Programmer signature dans 30 jours."',
  vente: 'POST-ACHAT — INTERDIT de re-vendre. Ex: "Féliciter. DEMANDER PARRAINAGE: 1 nom de prospect."',
  relancement: 'Réengagement. Ex: "Référence précise au dernier échange. Pas de pression."',
  perdue: 'Clôture respectueuse. Ex: "Remercier. Demander la vraie raison. Laisser porte ouverte 6 mois."',
}

type PlaybookRow = {
  id: string
  system_prompt: string
  stage_overrides: Record<string, string>
  updated_at: string
}

export function PlaybookAdminPage() {
  const qc = useQueryClient()

  const { data: row, isLoading } = useQuery({
    queryKey: ['global-playbook'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('global_playbook' as never)
        .select('id, system_prompt, stage_overrides, updated_at')
        .limit(1)
        .maybeSingle()
      if (error) { handleSupabaseError(error); throw error }
      return data as PlaybookRow | null
    },
  })

  const [systemPrompt, setSystemPrompt] = useState('')
  const [stageOverrides, setStageOverrides] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (row) {
      setSystemPrompt(row.system_prompt ?? '')
      setStageOverrides(row.stage_overrides ?? {})
      setDirty(false)
    }
  }, [row])

  const save = useMutation({
    mutationFn: async () => {
      if (!row?.id) throw new Error('Playbook not initialized')
      // Strip empty/whitespace-only stage overrides before saving
      const cleaned: Record<string, string> = {}
      for (const [k, v] of Object.entries(stageOverrides)) {
        const trimmed = (v ?? '').trim()
        if (trimmed.length > 0) cleaned[k] = trimmed
      }
      const { error } = await supabase
        .from('global_playbook' as never)
        .update({ system_prompt: systemPrompt, stage_overrides: cleaned } as never)
        .eq('id', row.id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['global-playbook'] })
      setDirty(false)
      toast.success('Playbook global sauvegardé — actif pour tous les tenants')
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0579DA] border-t-transparent" /></div>
  }

  const updateStage = (stage: PipelineStage, value: string) => {
    setStageOverrides(prev => ({ ...prev, [stage]: value }))
    setDirty(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Playbook IA — global" subtitle="Le cerveau de la plateforme. Ce prompt est injecté dans chaque appel IA pour tous les tenants." />

      <Card>
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-immo-bg-primary p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-immo-accent-blue" />
          <div className="text-xs text-immo-text-secondary">
            <p className="mb-1 font-semibold text-immo-text-primary">Comment ça marche</p>
            <p>Ce prompt est ajouté en tête de chaque requête IA (scripts d'appel, suggestions de biens, futurs assistants). Écrivez-le comme si vous donniez des consignes à un expert junior : ton, méthode de vente, règles à respecter, exemples de réponses aux objections, phrases de closing, etc.</p>
            <p className="mt-1 text-immo-text-muted">Aucun tenant n'a accès à cette configuration — c'est votre expertise qui pilote toute la plateforme.</p>
          </div>
        </div>

        <label className="mb-2 block text-sm font-semibold text-immo-text-primary">Prompt système</label>
        <textarea
          value={systemPrompt}
          onChange={e => { setSystemPrompt(e.target.value); setDirty(true) }}
          placeholder={`Tu es un expert en vente immobilière en Algérie, avec 10 ans d'expérience à Alger.

Méthode : Hormozi — focus valeur, urgence, closing direct.
Ton : Professionnel mais chaleureux. Utiliser le prénom dès le 2e contact.
Règle absolue : ne jamais donner un prix exact au téléphone, toujours inviter à la visite.

Objections fréquentes :
- "Trop cher" → Comparer au prix du m² du quartier, rappeler la qualité de finition.
- "Je vais réfléchir" → Proposer un créneau de visite cette semaine, mardi ou jeudi ?

Phrases de closing :
- "Mardi 14h ou jeudi 17h, quel créneau vous arrange ?"
- "On bloque la visite ce soir avant que l'unité ne parte ?"`}
          rows={20}
          className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-4 font-mono text-sm leading-relaxed text-immo-text-primary outline-none transition-colors focus:border-[#0579DA]"
        />
      </Card>

      <Card>
        <div className="mb-3">
          <h2 className="text-base font-semibold text-immo-text-primary flex items-center gap-2">
            <Phone className="h-4 w-4 text-immo-accent-blue" />
            Scripts d'appel — instructions par étape du pipeline
          </h2>
          <p className="text-xs text-immo-text-muted mt-1">
            Surcharge le bloc de contexte par défaut pour une étape donnée. Laisser vide = comportement par défaut (déjà calibré).
            Ces instructions s'appliquent à <strong>tous les tenants</strong> instantanément.
          </p>
        </div>

        <div className="space-y-3">
          {STAGE_ORDER.map(stage => {
            const meta = PIPELINE_STAGES[stage]
            const value = stageOverrides[stage] ?? ''
            return (
              <div key={stage} className="rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full shrink-0"
                    style={{ background: meta.color }}
                    aria-hidden
                  />
                  <h3 className="text-sm font-semibold text-immo-text-primary">{meta.label}</h3>
                  {value.trim().length > 0 && (
                    <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-immo-accent-green/10 text-immo-accent-green">
                      Override actif
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-immo-text-muted mb-2 italic">
                  <Sparkles className="inline h-3 w-3 me-1" />
                  {STAGE_HINTS[stage]}
                </p>
                <textarea
                  value={value}
                  onChange={e => updateStage(stage, e.target.value)}
                  rows={3}
                  maxLength={1500}
                  placeholder="Instructions personnalisées pour cette étape (optionnel — laissez vide pour utiliser le comportement par défaut)"
                  className="w-full resize-y rounded-lg border border-immo-border-default bg-immo-bg-card px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
                />
                <div className="mt-1 text-[10px] text-immo-text-muted text-right">{value.length}/1500</div>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-lg border border-immo-border-default bg-immo-bg-card p-3 shadow-lg">
        <p className="text-[11px] text-immo-text-muted">
          {row?.updated_at
            ? `Dernière modification ${formatDistanceToNow(new Date(row.updated_at), { addSuffix: true, locale: fr })}`
            : 'Jamais sauvegardé'}
        </p>
        <Button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          variant="blue"
        >
          {save.isPending ? <div className="me-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="me-1.5 h-4 w-4" />}
          {save.isPending ? 'Sauvegarde…' : 'Sauvegarder pour toute la plateforme'}
        </Button>
      </div>
    </div>
  )
}
