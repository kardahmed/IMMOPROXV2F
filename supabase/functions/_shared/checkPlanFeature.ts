// checkPlanFeature — backend feature gate for Edge Functions
//
// Returns whether a tenant is allowed to use a given feature, checking
// both layers:
//
//   1. Plan layer   — plan_limits.features[featureKey] on the tenant's
//                     subscribed plan (set by super admin at /admin/plans)
//   2. Tenant layer — tenant_settings.feature_X (set by tenant admin at
//                     /settings). Only 8 of the 15 features have a
//                     tenant-level override; the rest are plan-only.
//
// Mirrors the client-side useFeatureAccess hook so gate logic stays
// identical between frontend and backend.
//
// Usage inside a Deno.serve handler:
//
//   import { checkPlanFeature } from '../_shared/checkPlanFeature.ts'
//
//   const check = await checkPlanFeature(supabase, tenantId, 'whatsapp')
//   if (!check.allowed) {
//     return json({
//       error: check.reason === 'plan'
//         ? `Cette fonctionnalité n'est pas incluse dans votre plan (${check.plan}).`
//         : `Cette fonctionnalité a été désactivée par l'administrateur de votre agence.`,
//       reason: check.reason,
//       plan: check.plan,
//     }, 403)
//   }

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Plan feature key → tenant_settings column. Every plan-level feature
// has a tenant override. Must stay in sync with TENANT_COLUMN in
// src/hooks/useFeatureAccess.ts and FEATURES in
// src/pages/settings/sections/FeaturesSection.tsx.
const TENANT_COLUMN: Record<string, string> = {
  payment_tracking: 'feature_payment_tracking',
  charges:          'feature_charges',
  pdf_generation:   'feature_documents',
  goals:            'feature_goals',
  landing_pages:    'feature_landing_pages',
  ai_scripts:       'feature_ai_scripts',
  whatsapp:         'feature_whatsapp',
  auto_tasks:       'feature_auto_tasks',
  ai_suggestions:   'feature_ai_suggestions',
  ai_documents:     'feature_ai_documents',
  ai_custom:        'feature_ai_custom',
  export_csv:       'feature_export_csv',
  custom_branding:  'feature_custom_branding',
  api_access:       'feature_api_access',
  roi_marketing:    'feature_roi_marketing',
}

export interface FeatureCheckResult {
  allowed: boolean
  reason: 'plan' | 'tenant' | null
  plan: string
}

export async function checkPlanFeature(
  supabase: SupabaseClient,
  tenantId: string,
  featureKey: string,
): Promise<FeatureCheckResult> {
  // Resolve tenant's current plan
  const { data: tenant } = await supabase
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single()

  const plan = (tenant as { plan: string } | null)?.plan ?? 'free'

  // Load plan features — the JSONB column written by /admin/plans
  const { data: limits } = await supabase
    .from('plan_limits')
    .select('features')
    .eq('plan', plan)
    .single()

  const planFeatures = (limits as { features: Record<string, boolean> } | null)?.features ?? {}

  if (planFeatures[featureKey] !== true) {
    return { allowed: false, reason: 'plan', plan }
  }

  // Check tenant override if the feature has one
  const tenantColumn = TENANT_COLUMN[featureKey]
  if (tenantColumn) {
    const { data: settings } = await supabase
      .from('tenant_settings')
      .select(tenantColumn)
      .eq('tenant_id', tenantId)
      .single()

    const row = settings as Record<string, boolean> | null
    if (row?.[tenantColumn] === false) {
      return { allowed: false, reason: 'tenant', plan }
    }
  }

  return { allowed: true, reason: null, plan }
}
