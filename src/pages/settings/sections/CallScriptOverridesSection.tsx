import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Sparkles, Trash2, Phone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/common'
import toast from 'react-hot-toast'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'

// Ordered list — kanban order so the section reads top-to-bottom
// the same way the funnel flows.
const STAGE_ORDER: PipelineStage[] = [
  'accueil', 'visite_a_gerer', 'visite_confirmee', 'visite_terminee',
  'negociation', 'reservation', 'vente', 'relancement', 'perdue',
]

// Default placeholder hints for each stage so the agency knows what
// kind of override to write. Mirrors the spirit of
// _shared/stagePromptContext.ts but expressed as a help text.
const STAGE_HINTS: Record<PipelineStage, string> = {
  accueil:
    'Premier contact. Ex: "Toujours commencer par le prénom du client. Demander la source du lead. Proposer une visite si l\'unité F4 est disponible."',
  visite_a_gerer:
    'Caler la visite. Ex: "Proposer 3 créneaux entre 10h-12h ou 15h-17h. Confirmer par WhatsApp avec un lien GPS."',
  visite_confirmee:
    'Rappel J-1. Ex: "Rappeler la veille à 17h. Préciser le code de l\'immeuble. Demander si conjoint accompagne."',
  visite_terminee:
    'Feedback à chaud. Ex: "Demander note sur 5. Si > 4 → proposer réservation. Si < 3 → proposer un autre projet."',
  negociation:
    'Lever objections. Ex: "Marge négociable jusqu\'à -3%. Mention paiement en 18 mois si demandé. Validation admin si > 5%."',
  reservation:
    'Sécuriser le dépôt. Ex: "Confirmer reçu acompte. Programmer signature dans 30 jours max. Préparer CIN + justificatif revenus."',
  vente:
    'POST-ACHAT — INTERDIT de re-vendre. Ex: "Féliciter chaleureusement. Vérifier échéancier. DEMANDER PARRAINAGE: 1 nom de prospect."',
  relancement:
    'Réengagement. Ex: "Référence précise au dernier échange. Question ouverte sur le projet. Pas de pression."',
  perdue:
    'Clôture respectueuse. Ex: "Remercier. Demander la vraie raison de la perte. Laisser porte ouverte 6 mois."',
}

interface OverrideRow {
  id: string
  pipeline_stage: PipelineStage
  custom_instructions: string
  enabled: boolean
}

export function CallScriptOverridesSection() {
  const tenantId = useAuthStore(s => s.tenantId)
  const role = useAuthStore(s => s.role)
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()

  const isAdmin = role === 'admin' || role === 'super_admin'

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ['call-script-overrides', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('call_script_overrides' as never)
        .select('id, pipeline_stage, custom_instructions, enabled')
        .eq('tenant_id', tenantId!)
      return (data ?? []) as unknown as OverrideRow[]
    },
    enabled: !!tenantId,
  })

  const overrideByStage = new Map(overrides.map(o => [o.pipeline_stage, o]))

  if (!isAdmin) {
    return (
      <Card>
        <div className="p-6 text-center text-sm text-immo-text-muted">
          Seul un administrateur peut modifier les scripts d'appel.
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-immo-text-primary flex items-center gap-2">
          <Phone className="h-5 w-5 text-immo-accent-blue" />
          Scripts d'appel par étape
        </h2>
        <p className="text-sm text-immo-text-muted mt-0.5">
          Personnalisez les instructions données à l'IA pour générer les scripts d'appel à chaque étape du pipeline.
          Si aucune surcharge n'est définie, l'IA utilise un comportement par défaut adapté à chaque étape.
        </p>
      </div>

      <div className="rounded-lg border border-immo-accent-blue/20 bg-immo-accent-blue/5 p-3 text-xs text-immo-accent-blue">
        💡 Vous pouvez laisser une étape vide — l'IA utilisera alors son comportement par défaut (déjà bien adapté).
        Surchargez seulement les étapes où vous voulez un ton ou des règles spécifiques à votre agence.
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-immo-text-muted">Chargement…</div>
      ) : (
        <div className="space-y-3">
          {STAGE_ORDER.map(stage => (
            <StageOverrideCard
              key={stage}
              stage={stage}
              existing={overrideByStage.get(stage) ?? null}
              tenantId={tenantId!}
              userId={userId ?? null}
              onSaved={() => qc.invalidateQueries({ queryKey: ['call-script-overrides', tenantId] })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function StageOverrideCard({
  stage, existing, tenantId, userId, onSaved,
}: {
  stage: PipelineStage
  existing: OverrideRow | null
  tenantId: string
  userId: string | null
  onSaved: () => void
}) {
  const [text, setText] = useState(existing?.custom_instructions ?? '')
  const [enabled, setEnabled] = useState(existing?.enabled ?? true)

  const meta = PIPELINE_STAGES[stage]

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = text.trim()

      if (existing && trimmed.length === 0) {
        // Empty + existed → delete the override
        const { error } = await supabase
          .from('call_script_overrides' as never)
          .delete()
          .eq('id', existing.id)
        if (error) throw error
        return
      }

      if (trimmed.length === 0) return // nothing to save and nothing existed

      if (existing) {
        const { error } = await supabase
          .from('call_script_overrides' as never)
          .update({ custom_instructions: trimmed, enabled } as never)
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('call_script_overrides' as never)
          .insert({
            tenant_id: tenantId,
            pipeline_stage: stage,
            custom_instructions: trimmed,
            enabled,
            created_by: userId,
          } as never)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(existing && text.trim().length === 0
        ? `Surcharge supprimée pour ${meta.label}`
        : `Sauvegardé : ${meta.label}`)
      onSaved()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: async () => {
      if (!existing) return
      if (!window.confirm(`Supprimer la surcharge pour "${meta.label}" ? L'IA reviendra au comportement par défaut.`)) {
        throw new Error('Annulé')
      }
      const { error } = await supabase
        .from('call_script_overrides' as never)
        .delete()
        .eq('id', existing.id)
      if (error) throw error
    },
    onSuccess: () => {
      setText('')
      toast.success('Surcharge supprimée')
      onSaved()
    },
    onError: (err: Error) => { if (err.message !== 'Annulé') toast.error(err.message) },
  })

  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="inline-block h-3 w-3 rounded-full shrink-0"
            style={{ background: meta.color }}
            aria-hidden
          />
          <h3 className="text-sm font-semibold text-immo-text-primary">{meta.label}</h3>
          {existing && (
            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
              existing.enabled
                ? 'bg-immo-accent-green/10 text-immo-accent-green'
                : 'bg-immo-text-muted/10 text-immo-text-muted'
            }`}>
              {existing.enabled ? 'Active' : 'Désactivée'}
            </span>
          )}
        </div>

        <p className="text-[11px] text-immo-text-muted mb-2 italic">
          <Sparkles className="inline h-3 w-3 me-1" />
          {STAGE_HINTS[stage]}
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={1500}
          placeholder="Instructions personnalisées pour cette étape (optionnel — laissez vide pour utiliser le comportement par défaut)"
          className="w-full resize-y rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] text-immo-text-muted">{text.length}/1500</div>
          <div className="flex gap-2">
            {existing && (
              <>
                <label className="inline-flex items-center gap-2 text-xs text-immo-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Activée
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                  className="text-immo-status-red hover:bg-immo-status-red/10"
                >
                  <Trash2 className="h-3 w-3 me-1" /> Supprimer
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || (!existing && text.trim().length === 0)}
              variant="blue"
            >
              <Save className="h-3 w-3 me-1" /> {existing ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
