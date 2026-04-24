import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { usePlanEnforcement } from './usePlanEnforcement'

// Plan feature key → tenant_settings column name. Features not listed
// here are plan-only: the tenant admin has no override switch. This
// mirrors the FEATURES array in FeaturesSection.tsx.
const TENANT_COLUMN: Record<string, string> = {
  payment_tracking: 'feature_payment_tracking',
  charges:          'feature_charges',
  pdf_generation:   'feature_documents',
  goals:            'feature_goals',
  landing_pages:    'feature_landing_pages',
  ai_scripts:       'feature_ai_scripts',
  whatsapp:         'feature_whatsapp',
  auto_tasks:       'feature_auto_tasks',
}

interface FeatureAccess {
  allowed: boolean
  isLoading: boolean
  reason: 'plan' | 'tenant' | null
}

export function useFeatureAccess(featureKey: string): FeatureAccess {
  const tenantId = useAuthStore(s => s.tenantId)
  const { hasFeature } = usePlanEnforcement()
  const tenantColumn = TENANT_COLUMN[featureKey]

  const { data: tenantToggle, isLoading } = useQuery({
    queryKey: ['tenant-feature-toggle', tenantId, tenantColumn],
    queryFn: async () => {
      if (!tenantColumn || !tenantId) return true
      const { data } = await supabase
        .from('tenant_settings')
        .select(tenantColumn as never)
        .eq('tenant_id', tenantId)
        .single()
      const row = data as Record<string, boolean> | null
      return row?.[tenantColumn] !== false
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  })

  const planAllowed = hasFeature(featureKey)
  const tenantAllowed = tenantToggle !== false

  return {
    allowed: planAllowed && tenantAllowed,
    isLoading: !!tenantColumn && isLoading,
    reason: !planAllowed ? 'plan' : !tenantAllowed ? 'tenant' : null,
  }
}
