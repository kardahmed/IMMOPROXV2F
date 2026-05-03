import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Workflow, Building2, UserPlus, Settings as SettingsIcon, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

interface Step {
  icon: LucideIcon
  title: string
  body: string
  cta?: { label: string; to: string }
}

const STEPS: Step[] = [
  {
    icon: Workflow,
    title: 'Votre pipeline de vente',
    body: 'Le cœur du CRM : 9 étapes, de la prospection à la signature. Chaque client avance de colonne en colonne et vous voyez en un coup d\'œil où en est votre business.',
    cta: { label: 'Voir le pipeline', to: '/pipeline' },
  },
  {
    icon: Building2,
    title: 'Vos projets et biens',
    body: 'Créez vos projets (immeubles, résidences, lotissements) puis ajoutez les biens à l\'intérieur (appartements, villas, commerces...). Chaque réservation part de là.',
    cta: { label: 'Créer mon 1er projet', to: '/projects' },
  },
  {
    icon: UserPlus,
    title: 'Votre équipe',
    body: 'Invitez vos agents commerciaux. Chacun voit uniquement ses propres clients, a ses objectifs de vente, et vous gardez la vue d\'ensemble sur /performance.',
    cta: { label: 'Inviter un agent', to: '/agents' },
  },
  {
    icon: SettingsIcon,
    title: 'Configuration et WhatsApp',
    body: 'Personnalisez le pipeline, les plans de paiement, vos modèles de documents et de reçus. Bientôt : envois WhatsApp automatiques pour les rappels de visite et de paiement.',
    cta: { label: 'Ouvrir les paramètres', to: '/settings' },
  },
]

export function WelcomeModal() {
  const role = useAuthStore(s => s.role)
  const tenantId = useAuthStore(s => s.tenantId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [forceClosed, setForceClosed] = useState(false)

  const isAdmin = role === 'admin'

  const { data } = useQuery({
    queryKey: ['welcome-modal-status', tenantId],
    queryFn: async () => {
      if (!tenantId) return null
      const { data } = await supabase
        .from('tenants')
        .select('welcome_modal_seen_at')
        .eq('id', tenantId)
        .single()
      return data as { welcome_modal_seen_at: string | null } | null
    },
    enabled: !!tenantId && isAdmin,
    staleTime: Infinity,
  })

  const markSeen = useMutation({
    mutationFn: async () => {
      if (!tenantId) return
      await supabase
        .from('tenants')
        .update({ welcome_modal_seen_at: new Date().toISOString() })
        .eq('id', tenantId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['welcome-modal-status', tenantId] })
    },
  })

  if (!isAdmin || !data || data.welcome_modal_seen_at || forceClosed) return null

  const s = STEPS[step]
  const isLast = step === STEPS.length - 1
  const Icon = s.icon

  function handleClose() {
    markSeen.mutate()
    setForceClosed(true)
  }

  function handleCta() {
    if (s.cta) {
      markSeen.mutate()
      setForceClosed(true)
      navigate(s.cta.to)
    }
  }

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Bienvenue sur IMMO PRO-X"
      subtitle="Un tour rapide en 4 étapes pour vous lancer"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} className="text-immo-text-muted hover:text-immo-text-primary">
            Passer l'introduction
          </Button>
          <div className="flex-1" />
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Précédent
            </Button>
          )}
          {isLast ? (
            <Button onClick={handleClose} variant="blue" className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              Commencer
            </Button>
          ) : (
            <Button onClick={() => setStep(step + 1)} variant="blue" className="gap-1.5">
              Suivant
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0579DA]/10 text-[#0579DA]">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-immo-text-primary">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-immo-text-secondary">{s.body}</p>
          </div>
        </div>

        {s.cta && (
          <button
            onClick={handleCta}
            className="group flex w-full items-center justify-between rounded-lg border border-[#0579DA]/30 bg-[#0579DA]/5 px-4 py-3 text-sm font-medium text-[#0579DA] transition-colors hover:bg-[#0579DA]/10"
          >
            <span>{s.cta.label}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}

        <div className="flex items-center justify-center gap-1.5 pt-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Étape ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? 'w-8 bg-[#0579DA]'
                  : i < step
                    ? 'w-1.5 bg-[#0579DA]/60'
                    : 'w-1.5 bg-immo-border-default'
              }`}
            />
          ))}
        </div>
      </div>
    </Modal>
  )
}
