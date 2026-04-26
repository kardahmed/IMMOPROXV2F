// Shared helper to enforce per-tenant API quotas before hitting an
// external paid service. Counts current-month usage from api_costs
// and compares it to the plan's quota_*_monthly column. Also enforces
// a per-hour burst cap across all services to stop runaway loops.
//
// Convention: -1 in plan_limits = unlimited (used for enterprise).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type QuotaService = 'anthropic' | 'resend' | 'whatsapp'

const QUOTA_FIELD: Record<QuotaService, string> = {
  anthropic: 'quota_ai_calls_monthly',
  resend: 'quota_emails_monthly',
  whatsapp: 'quota_whatsapp_messages_monthly',
}

export interface QuotaResult {
  allowed: boolean
  reason?: 'monthly' | 'burst'
  used: number
  limit: number
  unlimited: boolean
  plan: string
  reset_at: string
  message?: string
}

export async function checkQuota(
  supabase: SupabaseClient,
  tenantId: string,
  service: QuotaService,
): Promise<QuotaResult> {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single()

  const plan = (tenant as { plan: string } | null)?.plan ?? 'free'

  const { data: limits } = await supabase
    .from('plan_limits')
    .select('quota_ai_calls_monthly, quota_emails_monthly, quota_whatsapp_messages_monthly, quota_burst_per_hour')
    .eq('plan', plan)
    .single()

  const limitsObj = limits as Record<string, number> | null
  const monthlyLimit = limitsObj?.[QUOTA_FIELD[service]] ?? 0
  const burstLimit = limitsObj?.quota_burst_per_hour ?? 100

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const monthEnd = new Date(monthStart)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)

  const { count: monthlyUsed } = await supabase
    .from('api_costs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('service', service)
    .gte('created_at', monthStart.toISOString())

  const used = monthlyUsed ?? 0

  if (monthlyLimit === -1) {
    return {
      allowed: true,
      used,
      limit: -1,
      unlimited: true,
      plan,
      reset_at: monthEnd.toISOString(),
    }
  }

  if (used >= monthlyLimit) {
    return {
      allowed: false,
      reason: 'monthly',
      used,
      limit: monthlyLimit,
      unlimited: false,
      plan,
      reset_at: monthEnd.toISOString(),
      message: monthlyLimit === 0
        ? `Cette fonctionnalité n'est pas incluse dans votre plan (${plan}).`
        : `Quota mensuel atteint pour ${service} (${used}/${monthlyLimit}). Réinitialisation au ${new Date(monthEnd).toLocaleDateString('fr-FR')}.`,
    }
  }

  if (burstLimit !== -1) {
    const hourStart = new Date(Date.now() - 60 * 60 * 1000)
    const { count: burstUsed } = await supabase
      .from('api_costs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', hourStart.toISOString())

    if ((burstUsed ?? 0) >= burstLimit) {
      const burstReset = new Date(Date.now() + 60 * 60 * 1000)
      return {
        allowed: false,
        reason: 'burst',
        used: burstUsed ?? 0,
        limit: burstLimit,
        unlimited: false,
        plan,
        reset_at: burstReset.toISOString(),
        message: `Limite de débit atteinte (${burstUsed}/${burstLimit} appels en 1h). Réessayez plus tard.`,
      }
    }
  }

  return {
    allowed: true,
    used,
    limit: monthlyLimit,
    unlimited: false,
    plan,
    reset_at: monthEnd.toISOString(),
  }
}

// Standardized 429 response builder
export function quotaErrorResponse(
  result: QuotaResult,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: result.message ?? 'Quota dépassé',
      code: 'QUOTA_EXCEEDED',
      reason: result.reason,
      used: result.used,
      limit: result.limit,
      plan: result.plan,
      reset_at: result.reset_at,
    }),
    {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
}
