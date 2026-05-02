import { Navigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useSuperAdminStore } from '@/store/superAdminStore'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { useTrialEligiblePlans } from '@/hooks/usePlans'
import { SuspendedPage } from '@/components/common/SuspendedPage'
import { TrialExpiredPage } from '@/components/common/TrialExpiredPage'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, role } = useAuth()
  const { inspectedTenantId } = useSuperAdminStore()
  const tenantId = useAuthStore(s => s.tenantId)
  // Trial-eligible plan slugs come from plan_limits.is_trial_eligible
  // (migration 059), not from a hardcoded === 'free' check.
  const trialEligiblePlans = useTrialEligiblePlans()

  // Check tenant suspension + trial status
  const { data: tenantStatus } = useQuery({
    queryKey: ['tenant-status', tenantId, trialEligiblePlans.join(',')],
    queryFn: async () => {
      if (!tenantId) return null
      const { data } = await supabase
        .from('tenants')
        .select('suspended_at, trial_ends_at, plan')
        .eq('id', tenantId)
        .single()
      if (!data) return null
      const t = data as unknown as { suspended_at: string | null; trial_ends_at: string | null; plan: string }
      return {
        isSuspended: !!t.suspended_at,
        isTrialExpired: trialEligiblePlans.includes(t.plan) && !!t.trial_ends_at && new Date(t.trial_ends_at) < new Date(),
      }
    },
    enabled: !!tenantId && role !== 'super_admin',
    staleTime: 60_000,
  })

  // Wait until session check AND profile fetch are complete
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-immo-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" />
          <p className="text-xs text-immo-text-muted">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Profile loaded but role is null (fetch failed) → login
  if (role === null) {
    console.warn('[ProtectedRoute] Role is null after loading, redirecting to login')
    return <Navigate to="/login" replace />
  }

  // Super admin without inspection mode → redirect to /admin
  if (role === 'super_admin' && !inspectedTenantId) {
    return <Navigate to="/admin" replace />
  }

  // Tenant suspended → show suspended page
  if (tenantStatus?.isSuspended) {
    return <SuspendedPage />
  }

  // Trial expired → show upgrade page
  if (tenantStatus?.isTrialExpired) {
    return <TrialExpiredPage />
  }

  return <Outlet />
}
