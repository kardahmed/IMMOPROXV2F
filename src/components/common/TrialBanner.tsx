import { useQuery } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useTrialEligiblePlans } from '@/hooks/usePlans'

export function TrialBanner() {
  const tenantId = useAuthStore(s => s.tenantId)
  // Replaces the old hardcoded `t.plan === 'free'` check. Plans are
  // tagged is_trial_eligible in plan_limits (see migration 059) so we
  // can introduce new trial-style plans without code changes.
  const trialEligiblePlans = useTrialEligiblePlans()

  const { data: trialInfo } = useQuery({
    queryKey: ['trial-info', tenantId, trialEligiblePlans.join(',')],
    queryFn: async () => {
      if (!tenantId) return null
      const { data } = await supabase.from('tenants').select('trial_ends_at, plan').eq('id', tenantId).single()
      if (!data) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = data as any as { trial_ends_at: string | null; plan: string }
      if (!t.trial_ends_at || !trialEligiblePlans.includes(t.plan)) return null
      const daysLeft = Math.ceil((new Date(t.trial_ends_at).getTime() - Date.now()) / 86400000)
      return { daysLeft, expired: daysLeft <= 0 }
    },
    enabled: !!tenantId && trialEligiblePlans.length > 0,
    staleTime: 300_000,
  })

  if (!trialInfo || trialInfo.daysLeft > 14) return null

  if (trialInfo.expired) {
    return (
      <div className="flex items-center justify-between bg-immo-status-red px-4 py-2">
        <span className="text-xs font-semibold text-white">Votre essai gratuit a expire. Passez a un plan pour continuer.</span>
        <a href="/settings" className="rounded-md bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30">Upgrader</a>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between bg-immo-status-orange px-4 py-2">
      <span className="flex items-center gap-2 text-xs font-semibold text-white">
        <Clock className="h-3.5 w-3.5" /> Essai gratuit : {trialInfo.daysLeft} jour(s) restant(s)
      </span>
      <a href="/settings" className="rounded-md bg-white/20 px-3 py-1 text-xs font-medium text-white hover:bg-white/30">Voir les plans</a>
    </div>
  )
}
