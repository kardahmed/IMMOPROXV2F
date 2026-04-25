import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkPlanFeature } from '../_shared/checkPlanFeature.ts'

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
    const { campaign_id } = await req.json()
    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'Missing campaign_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 1. Get campaign details
    const { data: campaign, error: campErr } = await supabase
      .from('email_campaigns')
      .select('*, email_templates(html_cache, subject)')
      .eq('id', campaign_id)
      .single()

    if (campErr || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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

    // 5. Get platform settings
    const { data: settings } = await supabase.from('platform_settings').select('support_email, platform_name').limit(1).single()
    const fromName = (settings as { platform_name: string } | null)?.platform_name ?? 'IMMO PRO-X'
    const fromEmail = (settings as { support_email: string } | null)?.support_email ?? 'noreply@immoprox.com'

    // 6. Get template HTML
    const template = campaign.email_templates as { html_cache: string; subject: string } | null
    let htmlTemplate = template?.html_cache ?? ''
    const emailSubject = campaign.subject || template?.subject || 'Email'

    // 7. Send in batches
    let totalSent = 0

    if (!resendApiKey) {
      console.warn('No RESEND_API_KEY — logging emails without sending')
    }

    const trackingBaseUrl = `${supabaseUrl}/functions/v1/track-email`

    for (let i = 0; i < (recipients?.length ?? 0); i += BATCH_SIZE) {
      const batch = recipients!.slice(i, i + BATCH_SIZE)

      for (const recipient of batch) {
        try {
          // Personalize HTML
          let personalizedHtml = htmlTemplate
            .replace(/\{client_name\}/g, recipient.full_name ?? '')
            .replace(/\{email\}/g, recipient.email)

          // Add tracking pixel
          const openTrackUrl = `${trackingBaseUrl}?t=open&rid=${recipient.id}&cid=${campaign_id}`
          personalizedHtml = personalizedHtml.replace(
            '</body>',
            `<img src="${openTrackUrl}" width="1" height="1" style="display:block;width:1px;height:1px;border:0" alt="" /></body>`
          )

          // Wrap click URLs for tracking
          personalizedHtml = personalizedHtml.replace(
            /href="(https?:\/\/[^"]+)"/g,
            (_match: string, url: string) => {
              if (url.includes('track-email')) return `href="${url}"` // don't double-wrap
              return `href="${trackingBaseUrl}?t=click&rid=${recipient.id}&cid=${campaign_id}&url=${encodeURIComponent(url)}"`
            }
          )

          if (resendApiKey) {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendApiKey}` },
              body: JSON.stringify({
                from: `${fromName} <${fromEmail}>`,
                to: [recipient.email],
                subject: emailSubject,
                html: personalizedHtml,
              }),
            })

            if (res.ok) {
              await supabase.from('email_campaign_recipients')
                .update({ status: 'sent', sent_at: new Date().toISOString() })
                .eq('id', recipient.id)
              totalSent++
            } else {
              await supabase.from('email_campaign_recipients')
                .update({ status: 'failed' })
                .eq('id', recipient.id)
            }
          } else {
            // Log-only mode
            await supabase.from('email_campaign_recipients')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('id', recipient.id)
            totalSent++
          }
        } catch (err) {
          console.error(`Failed to send to ${recipient.email}:`, err)
          await supabase.from('email_campaign_recipients')
            .update({ status: 'failed' })
            .eq('id', recipient.id)
        }
      }
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
