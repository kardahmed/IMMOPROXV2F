import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface PlanRow {
  plan: string                          // slug, e.g. 'starter'
  label_fr: string | null
  label_ar: string | null
  max_agents: number
  max_projects: number
  max_units: number
  max_clients: number
  max_storage_mb: number
  max_ai_tokens_monthly: number
  price_monthly: number
  price_yearly: number
  features: Record<string, boolean>
  quota_ai_calls_monthly: number
  quota_emails_monthly: number
  quota_whatsapp_messages_monthly: number
  quota_burst_per_hour: number
  setup_fee_dzd: number
  estimated_cost_da_monthly: number
  gross_margin_pct: number
  is_trial_eligible: boolean
  sort_order: number
}

// Reads all plans from plan_limits dynamically — the previous
// PLAN_FILTER_OPTIONS constant + plan === 'free' checks scattered
// across the code are replaced by this single source of truth.
export function usePlans() {
  return useQuery({
    queryKey: ['all-plans'],
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase
        .from('plan_limits')
        .select('*')
        .order('sort_order', { ascending: true })
      if (error) throw error
      // Sort by sort_order, fallback to price for legacy rows where it's still 100
      return (data ?? []).sort((a, b) => {
        const sortA = (a as { sort_order?: number }).sort_order ?? 100
        const sortB = (b as { sort_order?: number }).sort_order ?? 100
        if (sortA !== sortB) return sortA - sortB
        return (a.price_monthly ?? 0) - (b.price_monthly ?? 0)
      }) as unknown as PlanRow[]
    },
    staleTime: 5 * 60_000,
  })
}

// Helper: returns the plan slugs that are flagged as trial-eligible
// (replaces hardcoded `t.plan === 'free'` checks across the codebase).
export function useTrialEligiblePlans() {
  const { data: plans = [] } = usePlans()
  return plans.filter(p => p.is_trial_eligible).map(p => p.plan)
}
