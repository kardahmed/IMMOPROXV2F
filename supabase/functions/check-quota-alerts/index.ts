// Hourly cron: scans every active tenant for quota usage and sends a
// single email per (tenant, service, threshold, month) when usage
// crosses 90% or 100% of the plan limit.
//
// The de-dup table quota_alerts_sent (migration 039) ensures we never
// re-send the same alert in the same calendar month.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmailInternal } from '../_shared/send-email-internal.ts'
import { isAuthorizedCron, unauthorizedResponse } from '../_shared/cronAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type Service = 'anthropic' | 'resend' | 'whatsapp'

const QUOTA_FIELD: Record<Service, string> = {
  anthropic: 'quota_ai_calls_monthly',
  resend: 'quota_emails_monthly',
  whatsapp: 'quota_whatsapp_messages_monthly',
}

const SERVICE_LABEL: Record<Service, string> = {
  anthropic: 'Suggestions IA',
  resend: 'Emails',
  whatsapp: 'Messages WhatsApp',
}

const THRESHOLDS = [90, 100] as const

function periodKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  // Service-role only — this cron iterates every tenant and may
  // trigger Resend emails on quota breaches. Without the gate any
  // unauthenticated caller could DoS the DB and burn Resend.
  if (!isAuthorizedCron(req)) return unauthorizedResponse()

  const supabase = createClient(supabaseUrl, serviceKey)
  const period = periodKey()

  let scanned = 0
  let alertsSent = 0
  let errors = 0

  try {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, email, plan')
      .is('deleted_at', null)
      .is('suspended_at', null)
      .order('id')

    const { data: planLimits } = await supabase
      .from('plan_limits')
      .select('plan, quota_ai_calls_monthly, quota_emails_monthly, quota_whatsapp_messages_monthly')

    const planMap = new Map<string, Record<string, number>>()
    for (const p of (planLimits ?? []) as Array<Record<string, unknown>>) {
      planMap.set(p.plan as string, p as Record<string, number>)
    }

    const monthStart = new Date()
    monthStart.setUTCDate(1)
    monthStart.setUTCHours(0, 0, 0, 0)

    for (const tenant of (tenants ?? []) as Array<{ id: string; name: string; email: string | null; plan: string }>) {
      const limits = planMap.get(tenant.plan ?? 'free')
      if (!limits) continue
      scanned++

      // Pre-fetch this month's usage per service in a single query
      const { data: usageRows } = await supabase
        .from('api_costs')
        .select('service')
        .eq('tenant_id', tenant.id)
        .gte('created_at', monthStart.toISOString())
      const usageByService: Record<string, number> = { anthropic: 0, resend: 0, whatsapp: 0 }
      for (const r of (usageRows ?? []) as Array<{ service: string }>) {
        usageByService[r.service] = (usageByService[r.service] ?? 0) + 1
      }

      // Pre-fetch already-sent alerts for this period in one query
      const { data: alreadySent } = await supabase
        .from('quota_alerts_sent')
        .select('service, threshold_pct')
        .eq('tenant_id', tenant.id)
        .eq('period_yyyymm', period)
      const sentSet = new Set(
        ((alreadySent ?? []) as Array<{ service: string; threshold_pct: number }>)
          .map(a => `${a.service}:${a.threshold_pct}`),
      )

      for (const service of ['anthropic', 'resend', 'whatsapp'] as Service[]) {
        const limit = limits[QUOTA_FIELD[service]] as number
        // Skip unlimited or disabled-feature plans
        if (limit === -1 || limit === 0) continue

        const used = usageByService[service] ?? 0
        const pct = (used / limit) * 100

        for (const threshold of THRESHOLDS) {
          if (pct < threshold) continue
          const key = `${service}:${threshold}`
          if (sentSet.has(key)) continue

          // Insert dedup row first (UNIQUE constraint guards races)
          const { error: insErr } = await supabase
            .from('quota_alerts_sent')
            .insert({
              tenant_id: tenant.id,
              service,
              threshold_pct: threshold,
              period_yyyymm: period,
              used_at_send: used,
              limit_at_send: limit,
              email_recipient: tenant.email,
            })
          if (insErr) {
            // If unique violation, another worker already sent — skip silently
            if (!String(insErr.message).includes('duplicate')) {
              console.error('[check-quota-alerts] insert dedup row failed', insErr)
              errors++
            }
            continue
          }

          if (!tenant.email) {
            console.warn(`[check-quota-alerts] tenant ${tenant.name} has no email, skipping send`)
            continue
          }

          const isCritical = threshold === 100
          const title = isCritical
            ? `🚨 Quota ${SERVICE_LABEL[service]} atteint`
            : `⚠️ ${SERVICE_LABEL[service]} : ${threshold}% du quota consommé`

          const body = isCritical
            ? `Bonjour ${tenant.name},

Votre quota mensuel <strong>${SERVICE_LABEL[service]}</strong> est <strong>entièrement consommé</strong> (${used} / ${limit}).

Les nouveaux appels seront refusés jusqu'au 1er du mois prochain.

<strong>Pour continuer dès maintenant</strong>, contactez votre administrateur IMMO PRO-X pour passer au plan supérieur.

Cordialement,
L'équipe IMMO PRO-X`
            : `Bonjour ${tenant.name},

Vous avez consommé <strong>${threshold}%</strong> de votre quota mensuel <strong>${SERVICE_LABEL[service]}</strong> (${used} / ${limit}).

Au rythme actuel, vous risquez d'atteindre la limite avant la fin du mois. À 100%, les appels seront refusés jusqu'au 1er du mois suivant.

<strong>Anticipez</strong> en passant au plan supérieur, contactez votre administrateur IMMO PRO-X.

Cordialement,
L'équipe IMMO PRO-X`

          const sendResult = await sendEmailInternal({
            to: tenant.email,
            template: 'generic',
            template_data: { title, body, platform_name: 'IMMO PRO-X' },
            tenant_id: tenant.id,
            subject: title,
          })

          if (sendResult.sent) {
            alertsSent++
          } else {
            errors++
            console.error(`[check-quota-alerts] email failed for tenant ${tenant.name}`, sendResult.error)
          }
        }
      }
    }

    console.info(`[check-quota-alerts] ${scanned} tenant(s) scanned, ${alertsSent} alert(s) sent, ${errors} error(s)`)

    return new Response(
      JSON.stringify({ scanned, alertsSent, errors, period }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[check-quota-alerts] fatal', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
