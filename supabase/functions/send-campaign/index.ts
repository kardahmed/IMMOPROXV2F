import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkPlanFeature } from '../_shared/checkPlanFeature.ts'
import { trackResendCost } from '../_shared/trackCost.ts'
import { checkQuota, quotaErrorResponse } from '../_shared/checkQuota.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const resendApiKey = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BATCH_SIZE = 50

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // ── Auth gate ────────────────────────────────────────────────
    // Pre-fix this endpoint accepted any campaign_id without checking
    // who was calling. An attacker could enumerate or guess UUIDs and
    // trigger arbitrary tenants' campaigns to burn their email quota.
    // Now require either the service-role bearer (for in-app callers
    // proxying through service code) or a JWT whose tenant matches
    // the campaign's tenant.
    const authHeader = req.headers.get('Authorization') ?? ''
    const isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`

    let callerTenantId: string | null = null
    if (!isServiceRole) {
      const { data: authData, error: authErr } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', ''),
      )
      if (authErr || !authData?.user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      const { data: profile } = await supabase
        .from('users')
        .select('tenant_id, role')
        .eq('id', authData.user.id)
        .single()
      const p = profile as { tenant_id: string | null; role: string } | null
      // Only tenant admins (or super_admins) can launch a campaign.
      if (!p?.tenant_id || !['admin', 'super_admin'].includes(p.role)) {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      callerTenantId = p.tenant_id
    }

    const { campaign_id } = await req.json()
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'Missing campaign_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 1. Get campaign details
    const { data: campaign, error: campErr } = await supabase
      .from('email_campaigns')
      .select('*, marketing_email_templates(html_cache, subject)')
      .eq('id', campaign_id)
      .single()

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Tenant scope: a non-service-role caller can only launch their
    // own tenant's campaigns.
    if (!isServiceRole && campaign.tenant_id !== callerTenantId) {
      return new Response(
        JSON.stringify({ error: 'Cannot send another tenant\'s campaign' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return new Response(JSON.stringify({ error: 'Campaign already sent/sending' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Plan + tenant feature gate — email campaigns live inside the
    // ROI Marketing module which is gated on the same feature key.
    // Mirrors the route-level gate on /marketing-roi.
    const featureCheck = await checkPlanFeature(supabase, campaign.tenant_id as string, 'roi_marketing')
    if (!featureCheck.allowed) {
      return new Response(JSON.stringify({
        error: featureCheck.reason === 'plan'
          ? `Le module ROI Marketing (campagnes email) n'est pas inclus dans votre plan (${featureCheck.plan}).`
          : `Le module ROI Marketing a été désactivé par l'administrateur de votre agence.`,
        reason: featureCheck.reason,
        plan: featureCheck.plan,
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2. Mark as sending
    await supabase.from('email_campaigns').update({ status: 'sending' }).eq('id', campaign_id)

    // 3. Resolve segment — get matching clients
    const rules = campaign.segment_rules as { pipeline_stages?: string[]; sources?: string[]; project_ids?: string[] }
    let query = supabase
      .from('clients')
      .select('id, email, full_name')
      .eq('tenant_id', campaign.tenant_id)
      .not('email', 'is', null)

    if (rules.pipeline_stages?.length) query = query.in('pipeline_stage', rules.pipeline_stages)
    if (rules.sources?.length) query = query.in('source', rules.sources)
    if (rules.project_ids?.length) query = query.in('project_id', rules.project_ids)

    const { data: clients, error: clientErr } = await query
    if (clientErr) throw new Error(`Segment query failed: ${clientErr.message}`)

    const validClients = (clients ?? []).filter((c: { email: string | null }) => c.email)
    if (validClients.length === 0) {
      await supabase.from('email_campaigns').update({ status: 'sent', total_recipients: 0, total_sent: 0, sent_at: new Date().toISOString() }).eq('id', campaign_id)
      return new Response(JSON.stringify({ message: 'No recipients', count: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 4. Insert recipients
    const recipientInserts = validClients.map((c: { id: string; email: string; full_name: string }) => ({
      campaign_id,
      client_id: c.id,
      email: c.email,
      full_name: c.full_name,
      status: 'pending',
    }))

    const { data: recipients, error: insErr } = await supabase
      .from('email_campaign_recipients')
      .insert(recipientInserts)
      .select('id, email, full_name')

    if (insErr) throw new Error(`Insert recipients failed: ${insErr.message}`)

    await supabase.from('email_campaigns').update({ total_recipients: recipients?.length ?? 0 }).eq('id', campaign_id)

    // 4.5 Quota check — block the whole campaign if it would push the
    // tenant over its monthly Resend quota. Done once before the loop;
    // we don't re-check per recipient since BATCH_SIZE=50 paces things.
    const recipientCount = recipients?.length ?? 0
    if (recipientCount > 0) {
      const quota = await checkQuota(supabase, campaign.tenant_id as string, 'resend')
      if (!quota.allowed) {
        await supabase.from('email_campaigns').update({ status: 'failed' }).eq('id', campaign_id)
        return quotaErrorResponse(quota, corsHeaders)
      }
      if (!quota.unlimited && quota.used + recipientCount > quota.limit) {
        await supabase.from('email_campaigns').update({ status: 'failed' }).eq('id', campaign_id)
        return new Response(JSON.stringify({
          error: `Campagne refusée : ${recipientCount} destinataires dépasseraient votre quota mensuel (${quota.used}/${quota.limit} déjà utilisés). Augmentez votre plan ou réduisez la liste.`,
          code: 'QUOTA_EXCEEDED',
          reason: 'monthly_projected',
          used: quota.used,
          limit: quota.limit,
          requested: recipientCount,
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 5. Get platform settings
    const { data: settings } = await supabase.from('platform_settings').select('support_email, platform_name').limit(1).single()
    const fromName = (settings as { platform_name: string } | null)?.platform_name ?? 'IMMO PRO-X'
    const fromEmail = (settings as { support_email: string } | null)?.support_email ?? 'noreply@immoprox.com'

    // 6. Get template HTML
    const template = campaign.marketing_email_templates as { html_cache: string; subject: string } | null
    let htmlTemplate = template?.html_cache ?? ''
    const emailSubject = campaign.subject || template?.subject || 'Email'

    // 7. Send in batches
    let totalSent = 0

    if (!resendApiKey) {
      console.warn('No RESEND_API_KEY — logging emails without sending')
    }

    const trackingBaseUrl = `${supabaseUrl}/functions/v1/track-email`

    // Resend POST with up to 3 retries on 429 / 5xx, exponential backoff
    // (250ms, 500ms, 1s). Returns true on success, false otherwise. Logs
    // the response body on failure so we can debug from the function
    // logs instead of "status='failed'" with no context.
    async function sendOneWithRetry(to: string, html: string): Promise<boolean> {
      if (!resendApiKey) return true  // log-only mode upstream
      const body = JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject: emailSubject,
        html,
      })
      let attempt = 0
      while (attempt < 3) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
            body,
          })
          if (res.ok) return true
          if (res.status === 429 || res.status >= 500) {
            // Retryable. Read body for diagnostics + back off.
            const errBody = await res.text().catch(() => '')
            console.warn(`[send-campaign] Resend ${res.status} for ${to} (attempt ${attempt + 1}/3): ${errBody.slice(0, 200)}`)
            await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt)))
            attempt++
            continue
          }
          // 4xx other than 429 = caller error (bad email, invalid HTML…).
          // Don't retry — log + return false.
          const errBody = await res.text().catch(() => '')
          console.error(`[send-campaign] Resend ${res.status} for ${to} — non-retryable: ${errBody.slice(0, 200)}`)
          return false
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[send-campaign] network error for ${to} (attempt ${attempt + 1}/3): ${msg}`)
          await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt)))
          attempt++
        }
      }
      return false
    }

    // Process each batch with bounded concurrency (Promise.all over the
    // batch). Pre-fix the loop was sequential — every Resend round-trip
    // (~150-300ms) blocked the next, so 100-recipient campaigns hit the
    // 60s Edge Function timeout. Now BATCH_SIZE recipients fly in
    // parallel and the function finishes 5-10x faster.
    for (let i = 0; i < (recipients?.length ?? 0); i += BATCH_SIZE) {
      const batch = recipients!.slice(i, i + BATCH_SIZE)

      const results = await Promise.all(batch.map(async (recipient) => {
        try {
          let personalizedHtml = htmlTemplate
            .replace(/\{client_name\}/g, recipient.full_name ?? '')
            .replace(/\{email\}/g, recipient.email)

          const openTrackUrl = `${trackingBaseUrl}?t=open&rid=${recipient.id}&cid=${campaign_id}`
          personalizedHtml = personalizedHtml.replace(
            '</body>',
            `<img src="${openTrackUrl}" width="1" height="1" style="display:block;width:1px;height:1px;border:0" alt="" /></body>`
          )

          personalizedHtml = personalizedHtml.replace(
            /href="(https?:\/\/[^"]+)"/g,
            (_match: string, url: string) => {
              if (url.includes('track-email')) return `href="${url}"`
              return `href="${trackingBaseUrl}?t=click&rid=${recipient.id}&cid=${campaign_id}&url=${encodeURIComponent(url)}"`
            }
          )

          const ok = await sendOneWithRetry(recipient.email, personalizedHtml)
          await supabase.from('email_campaign_recipients')
            .update(ok
              ? { status: 'sent', sent_at: new Date().toISOString() }
              : { status: 'failed' })
            .eq('id', recipient.id)
          return ok ? 1 : 0
        } catch (err) {
          console.error(`[send-campaign] uncaught for ${recipient.email}:`, err)
          await supabase.from('email_campaign_recipients')
            .update({ status: 'failed' })
            .eq('id', recipient.id)
          return 0
        }
      }))

      totalSent += results.reduce((sum: number, n: number) => sum + n, 0)
    }

    if (resendApiKey && totalSent > 0) {
      await trackResendCost(supabase, totalSent, {
        tenantId: campaign.tenant_id,
        operation: 'send-campaign',
        metadata: { campaign_id, campaign_name: campaign.name },
      })
    }

    // 8. Update campaign stats
    await supabase.from('email_campaigns').update({
      status: 'sent',
      total_sent: totalSent,
      sent_at: new Date().toISOString(),
    }).eq('id', campaign_id)

    // 9. Log in email_logs
    await supabase.from('email_logs').insert({
      tenant_id: campaign.tenant_id,
      template: 'campaign',
      recipient: `${totalSent} destinataires`,
      subject: emailSubject,
      status: 'sent',
      provider: resendApiKey ? 'resend' : 'none',
      metadata: { campaign_id, campaign_name: campaign.name },
    })

    return new Response(JSON.stringify({
      message: `Campaign sent: ${totalSent}/${recipients?.length ?? 0}`,
      total_sent: totalSent,
      total_recipients: recipients?.length ?? 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('send-campaign error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
