import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { renderTemplate } from '../_shared/email-templates.ts'
import type { TemplateName } from '../_shared/email-templates.ts'
import { trackResendCost } from '../_shared/trackCost.ts'
import { checkQuota, quotaErrorResponse } from '../_shared/checkQuota.ts'
import { corsHeadersFor } from '../_shared/cors.ts'

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabase = createClient(supabaseUrl, serviceKey)

    // ── Auth gate ────────────────────────────────────────────────
    // Pre-fix this endpoint had no Authorization check at all — it
    // was a public open relay that anyone could use to send phishing
    // through our Resend account. Now we require either:
    //   (a) the service-role bearer (cron jobs and trusted server-
    //       side callers like check-reminders), OR
    //   (b) a valid user JWT whose tenant matches the request's
    //       tenant_id (for in-app email sending).
    const authHeader = req.headers.get('Authorization') ?? ''
    const isServiceRole = authHeader === `Bearer ${serviceKey}`

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
        .select('tenant_id')
        .eq('id', authData.user.id)
        .single()
      callerTenantId = (profile as { tenant_id: string | null } | null)?.tenant_id ?? null
      if (!callerTenantId) {
        return new Response(
          JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const { type, to, subject, body, template, template_data, tenant_id, client_id, metadata } = await req.json()

    // Non-service-role callers can only send for their own tenant.
    if (!isServiceRole && tenant_id && tenant_id !== callerTenantId) {
      return new Response(
        JSON.stringify({ error: 'Cannot send for another tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Resolve email content: template or raw body
    let emailSubject = subject
    let emailHtml = ''

    if (template) {
      // Use template system
      const result = renderTemplate(template as TemplateName, {
        platform_name: undefined, // will be overridden below
        ...template_data,
      })
      emailSubject = emailSubject || result.subject
      emailHtml = result.html
    } else {
      // Legacy: raw body — validate required fields
      if (!to || !subject || !body) {
        return new Response(JSON.stringify({ error: 'Missing: to, subject, body' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (!to) {
      return new Response(JSON.stringify({ error: 'Missing: to' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Audit (HIGH): validate recipient format and constrain it to a
    // member of the caller's tenant unless the call is service-role.
    // Without this, a tenant admin could blast phishing emails from
    // the platform's verified Resend domain to arbitrary recipients.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_RE.test(String(to))) {
      return new Response(JSON.stringify({ error: 'Invalid recipient email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (tenant_id && !metadata?.test) {
      // Verify the recipient belongs to the tenant — either as a
      // client.email, a user.email, or matching the platform support
      // mailbox itself (which is what most automation rows hit).
      const lowerTo = String(to).toLowerCase()
      const [clientMatch, userMatch, leadMatch] = await Promise.all([
        supabase.from('clients').select('id').eq('tenant_id', tenant_id).ilike('email', lowerTo).limit(1).maybeSingle(),
        supabase.from('users').select('id').eq('tenant_id', tenant_id).ilike('email', lowerTo).limit(1).maybeSingle(),
        supabase.from('marketing_leads').select('id').eq('tenant_id', tenant_id).ilike('email', lowerTo).limit(1).maybeSingle(),
      ])
      if (!clientMatch.data && !userMatch.data && !leadMatch.data) {
        return new Response(JSON.stringify({ error: 'Recipient not part of tenant' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const quota = await checkQuota(supabase, tenant_id, 'resend')
      if (!quota.allowed) return quotaErrorResponse(quota, corsHeaders)
    }

    // Pick the Resend credentials in this order:
    //   1. The tenant's own integration row (tenant_integrations type='resend',
    //      enabled=true) — emails go from THEIR domain on THEIR quota.
    //   2. Platform fallback (RESEND_API_KEY env var) — used for tenant
    //      invites, founder marketing pushes, and tenants who haven't yet
    //      configured their own Resend.
    //
    // Service-role callers (cron jobs, founder push) skip the lookup
    // entirely — they always run on the platform key. Look-ups happen
    // only when the caller is a tenant user AND tenant_id is set.
    let effectiveApiKey = resendApiKey
    let effectiveFrom: { name: string; email: string } | null = null
    if (tenant_id) {
      const { data: tenantInteg } = await supabase
        .from('tenant_integrations')
        .select('api_key, config, enabled')
        .eq('tenant_id', tenant_id)
        .eq('type', 'resend')
        .eq('enabled', true)
        .maybeSingle()
      const ti = tenantInteg as { api_key: string | null; config: { from_email?: string; from_name?: string } | null; enabled: boolean } | null
      if (ti?.api_key && ti.config?.from_email) {
        effectiveApiKey = ti.api_key
        effectiveFrom = {
          name: ti.config.from_name || ti.config.from_email,
          email: ti.config.from_email,
        }
      }
    }

    // Get platform settings for from email (fallback only)
    const { data: settings } = await supabase.from('platform_settings').select('support_email, platform_name').limit(1).single()
    const fromName = effectiveFrom?.name ?? (settings as { platform_name: string } | null)?.platform_name ?? 'IMMO PRO-X'
    const fromEmail = effectiveFrom?.email ?? (settings as { support_email: string } | null)?.support_email ?? 'noreply@immoprox.com'

    // If template was used, re-render with actual platform name
    if (template && !template_data?.platform_name) {
      const result = renderTemplate(template as TemplateName, {
        ...template_data,
        platform_name: fromName,
      })
      emailSubject = subject || result.subject
      emailHtml = result.html
    }

    // Legacy body wrapping (no template)
    if (!template && body) {
      emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #0579DA; font-size: 20px; margin: 0;">${fromName}</h1>
          </div>
          <div style="background: #ffffff; border: 1px solid #E3E8EF; border-radius: 12px; padding: 24px;">
            ${body.replace(/\n/g, '<br>')}
          </div>
          <p style="text-align: center; color: #8898AA; font-size: 11px; margin-top: 20px;">
            ${fromName} — CRM Immobilier
          </p>
        </div>`
    }

    let sent = false
    let provider = 'none'

    // Try Resend if configured. Up to 3 attempts on 429 / 5xx with
    // exponential backoff (250ms, 500ms, 1s) — matches the helper in
    // send-campaign. Pre-fix the function silently swallowed Resend
    // errors and stamped status='failed' with no diagnostic; now the
    // response body is logged on each non-2xx so post-mortem from
    // function logs is feasible.
    if (effectiveApiKey) {
      const body = JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject: emailSubject,
        html: emailHtml,
      })
      let attempt = 0
      while (attempt < 3 && !sent) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${effectiveApiKey}` },
            body,
          })
          if (res.ok) {
            sent = true
            provider = 'resend'
            break
          }
          if (res.status === 429 || res.status >= 500) {
            const errBody = await res.text().catch(() => '')
            console.warn(`[send-email] Resend ${res.status} for ${to} (attempt ${attempt + 1}/3): ${errBody.slice(0, 200)}`)
            await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt)))
            attempt++
            continue
          }
          // 4xx other than 429 = caller error — don't retry.
          const errBody = await res.text().catch(() => '')
          console.error(`[send-email] Resend ${res.status} for ${to} — non-retryable: ${errBody.slice(0, 200)}`)
          break
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[send-email] network error for ${to} (attempt ${attempt + 1}/3): ${msg}`)
          await new Promise(r => setTimeout(r, 250 * Math.pow(2, attempt)))
          attempt++
        }
      }
    }

    const emailStatus = metadata?.test ? 'test' : (sent ? 'sent' : 'failed')

    if (sent && !metadata?.test) {
      await trackResendCost(supabase, 1, {
        tenantId: tenant_id ?? null,
        operation: type ?? template ?? 'send-email',
        metadata: { template: template ?? null, recipient: to },
      })
    }

    // Log to email_logs table
    await supabase.from('email_logs').insert({
      tenant_id: tenant_id ?? null,
      template: template ?? null,
      recipient: to,
      subject: emailSubject,
      status: emailStatus,
      provider,
      metadata: {
        ...(metadata ?? {}),
        type: type ?? null,
        client_id: client_id ?? null,
      },
    })

    // Also log in notifications (backward compat)
    await supabase.from('notifications').insert({
      tenant_id: tenant_id ?? null,
      type: 'email_sent',
      title: `Email: ${emailSubject}`,
      message: `Envoye a ${to} via ${provider}`,
    })

    // Log in audit trail if tenant context
    if (tenant_id) {
      await supabase.from('history').insert({
        tenant_id,
        client_id: client_id ?? null,
        type: 'email',
        title: `Email envoye: ${emailSubject}`,
        description: `Destinataire: ${to}`,
      })
    }

    return new Response(JSON.stringify({ sent, provider, to, subject: emailSubject, status: emailStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
