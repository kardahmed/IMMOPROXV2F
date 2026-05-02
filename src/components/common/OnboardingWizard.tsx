import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Building2, Users, UserPlus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useState } from 'react'

interface OnboardingStep {
  key: string
  label: string
  icon: typeof Building2
  done: boolean
  action: () => void
}

export function OnboardingWizard() {
  const { t } = useTranslation()
  const tenantId = useAuthStore(s => s.tenantId)
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)

  const { data } = useQuery({
    queryKey: ['onboarding-status', tenantId],
    queryFn: async () => {
      if (!tenantId) return null
      const [projects, agents, clients, tenant] = await Promise.all([
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('role', ['agent']),
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('tenants').select('onboarding_completed').eq('id', tenantId).single(),
      ])
      return {
        hasProject: (projects.count ?? 0) > 0,
        hasAgent: (agents.count ?? 0) > 0,
        hasClient: (clients.count ?? 0) > 0,
        completed: (tenant.data as { onboarding_completed: boolean } | null)?.onboarding_completed ?? false,
      }
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  })

  const markComplete = useMutation({
    mutationFn: async () => {
      await supabase.from('tenants').update({ onboarding_completed: true } as never).eq('id', tenantId!)
    },
  })

  if (!data || data.completed || dismissed) return null
  if (data.hasProject && data.hasAgent && data.hasClient) {
    // Auto-complete
    if (!data.completed) markComplete.mutate()
    return null
  }

  const steps: OnboardingStep[] = [
    { key: 'project', label: 'Creer votre 1er projet', icon: Building2, done: data.hasProject, action: () => navigate('/projects') },
    { key: 'agent', label: 'Inviter un agent', icon: UserPlus, done: data.hasAgent, action: () => navigate('/agents') },
    { key: 'client', label: 'Ajouter un client', icon: Users, done: data.hasClient, action: () => navigate('/pipeline') },
  ]

  const progress = steps.filter(s => s.done).length
  const pct = Math.round((progress / steps.length) * 100)

  return (
    <div className="rounded-xl border border-immo-accent-green/20 bg-immo-accent-green/5 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-immo-text-primary">Bienvenue ! Configurez votre espace</h3>
          <p className="text-xs text-immo-text-muted">{progress}/{steps.length} etapes completees</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-24 rounded-full bg-immo-border-default">
            <div className="h-full rounded-full bg-immo-accent-green transition-all" style={{ width: `${pct}%` }} />
          </div>
          <button onClick={() => setDismissed(true)} aria-label={t('action.close')} className="text-immo-text-muted hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        {steps.map(step => (
          <button
            key={step.key}
            onClick={step.action}
            disabled={step.done}
            className={`flex flex-1 items-center gap-3 rounded-lg border p-3 text-left transition-all ${
              step.done
                ? 'border-immo-accent-green/30 bg-immo-accent-green/10'
                : 'border-immo-border-default bg-immo-bg-card hover:border-immo-accent-green/30'
            }`}
          >
            {step.done ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-immo-accent-green" />
            ) : (
              <step.icon className="h-5 w-5 shrink-0 text-immo-text-muted" />
            )}
            <span className={`text-xs font-medium ${step.done ? 'text-immo-accent-green line-through' : 'text-immo-text-primary'}`}>
              {step.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
