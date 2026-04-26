// Shared helper for inserting one row into api_costs from any
// Edge Function that hits an external paid API (Anthropic, Resend,
// Meta WhatsApp). All costs are stored in DZD (Algerian Dinar) so
// the super admin /admin/costs page can compute profit directly
// against plan_limits.price_monthly.
//
// Rates below are conservative estimates at ~140 DA/USD. Tune when
// real invoices come in.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Anthropic Claude Haiku 4.5: $1/M input, $5/M output (Jan 2026)
//   → 0.00014 DA/input-token, 0.00070 DA/output-token at 140 DA/USD
const ANTHROPIC_INPUT_DA_PER_TOKEN = 0.00014
const ANTHROPIC_OUTPUT_DA_PER_TOKEN = 0.00070

// Resend: $20/mo for 50k emails after free tier → ~$0.0004/email
//   → 0.056 DA/email at 140 DA/USD
const RESEND_DA_PER_EMAIL = 0.06

// Meta WhatsApp Cloud API — DZ market authentication/utility template:
// ~$0.005/msg, marketing ~$0.024/msg, free-form within 24h window = $0.
// Conservative blended estimate: 1 DA per outbound message.
const WHATSAPP_DA_PER_MESSAGE = 1

export interface TrackOpts {
  tenantId: string | null
  operation: string
  metadata?: Record<string, unknown>
}

async function insertCost(
  supabase: SupabaseClient,
  service: 'anthropic' | 'resend' | 'whatsapp',
  units: number,
  cost_da: number,
  opts: TrackOpts,
): Promise<void> {
  try {
    await supabase.from('api_costs').insert({
      tenant_id: opts.tenantId,
      service,
      operation: opts.operation,
      units,
      cost_da,
      metadata: opts.metadata ?? {},
    })
  } catch (err) {
    // Never let cost tracking break the user-facing flow.
    console.error('[trackCost] insert failed', service, err)
  }
}

export async function trackAnthropicCost(
  supabase: SupabaseClient,
  usage: { input_tokens?: number; output_tokens?: number } | undefined,
  opts: TrackOpts,
): Promise<void> {
  const inputTokens = usage?.input_tokens ?? 0
  const outputTokens = usage?.output_tokens ?? 0
  const totalUnits = inputTokens + outputTokens
  const cost_da = inputTokens * ANTHROPIC_INPUT_DA_PER_TOKEN
    + outputTokens * ANTHROPIC_OUTPUT_DA_PER_TOKEN
  await insertCost(supabase, 'anthropic', totalUnits, cost_da, {
    ...opts,
    metadata: {
      ...(opts.metadata ?? {}),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
  })
}

export async function trackResendCost(
  supabase: SupabaseClient,
  emailCount: number,
  opts: TrackOpts,
): Promise<void> {
  await insertCost(supabase, 'resend', emailCount, emailCount * RESEND_DA_PER_EMAIL, opts)
}

export async function trackWhatsAppCost(
  supabase: SupabaseClient,
  messageCount: number,
  opts: TrackOpts,
): Promise<void> {
  await insertCost(supabase, 'whatsapp', messageCount, messageCount * WHATSAPP_DA_PER_MESSAGE, opts)
}
