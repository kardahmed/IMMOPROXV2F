import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type PlanKey = 'free' | 'starter' | 'pro' | 'enterprise'

export interface PlanLimit {
  plan: PlanKey
  max_agents: number
  max_projects: number
  max_units: number
  max_clients: number
  max_storage_mb: number
  max_ai_tokens_monthly: number
  features: Record<string, boolean>
  price_monthly: number
}

export const PLAN_LABELS: Record<PlanKey, { label: string; color: string; bg: string }> = {
  free:       { label: 'Free',       color: 'text-immo-text-secondary', bg: 'bg-immo-text-secondary/10' },
  starter:    { label: 'Starter',    color: 'text-immo-accent-blue', bg: 'bg-immo-accent-blue/10' },
  pro:        { label: 'Pro',        color: 'text-[#0579DA]', bg: 'bg-[#0579DA]/10' },
  enterprise: { label: 'Enterprise', color: 'text-immo-status-orange', bg: 'bg-immo-status-orange/10' },
}

export function usePlanLimits() {
  return useQuery({
    queryKey: ['plan-limits'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plan_limits').select('*').order('price_monthly')
      if (error) throw error
      return data as PlanLimit[]
    },
    staleTime: 1000 * 60 * 30, // 30 min cache
  })
}

export function formatPlanPrice(price: number): string {
  if (price === 0) return 'Gratuit'
  return `${price.toLocaleString('fr')} DA/mois`
}
