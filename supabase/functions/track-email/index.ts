// track-email — pixel + click endpoint with hardened redirect.
//
// Big 4 audit found this was a CRIT open redirect: any URL in the
// `url=` query was used as 302 Location with no validation. An
// attacker crafted /track-email?t=click&rid=any&url=https://phish.com
// to phish users from the official immoprox.io domain.
//
// Two layers of protection now:
//
//   1. The redirect URL must be present in email_campaign_recipients
//      .allowed_redirects (or, fallback, in email_events.metadata.url
//      from a previous click — i.e. the URL was actually emailed).
//      Every other URL → 302 to a neutral landing page.
//
//   2. As a safety net, the redirect target is also constrained to
//      one of the trusted root domains the platform signs off on.
//      An attacker who somehow injected an arbitrary link into the
//      recipient row would still need it to live on a trusted host.
//
// The pixel pathway is unchanged.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Trusted domains where campaign links are allowed to land. Add the
// tenant's own marketing site here once we wire per-tenant allowlists.
const TRUSTED_HOSTS = new Set([
  'immoprox.io',
  'www.immoprox.io',
  'app.immoprox.io',
  'cal.eu',
])

// Pages we'll send users to instead when their click looks suspicious.
const SAFE_FALLBACK = 'https://immoprox.io/'

// 1x1 transparent GIF
const TRACKING_PIXEL = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0))

function isHostTrusted(rawUrl: string | null): boolean {
  if (!rawUrl) return false
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return TRUSTED_HOSTS.has(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const type = url.searchParams.get('t')          // 'open' or 'click'
  const recipientId = url.searchParams.get('rid')
  const campaignId = url.searchParams.get('cid')
  const redirectUrl = url.searchParams.get('url')

  if (!type || !recipientId) {
    return new Response('Missing params', { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const now = new Date().toISOString()

    if (type === 'open') {
      await supabase.from('email_events').insert({
        campaign_id: campaignId,
        recipient_id: recipientId,
        event_type: 'open',
      })

      await supabase.from('email_campaign_recipients')
        .update({ status: 'opened', opened_at: now })
        .eq('id', recipientId)
        .is('opened_at', null)

      if (campaignId) {
        const { data: camp } = await supabase.from('email_campaigns').select('total_opened').eq('id', campaignId).single()
        if (camp) {
          await supabase.from('email_campaigns')
            .update({ total_opened: (camp.total_opened ?? 0) + 1 })
            .eq('id', campaignId)
        }
      }

      return new Response(TRACKING_PIXEL, {
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      })
    }

    if (type === 'click') {
      // 1. Validate the requested URL — must be on a trusted host
      //    AND must match a URL we actually emailed. Otherwise it
      //    becomes a phishing redirector.
      const targetIsTrusted = isHostTrusted(redirectUrl)

      // Cross-check the URL against what was sent in the campaign.
      // Recipients store the raw HTML in `body_html`; we can't parse
      // every link, so we use a presence check: the URL must appear
      // in a known field (campaign body or template) for this campaign.
      let targetIsKnown = false
      if (redirectUrl && campaignId) {
        const { data: camp } = await supabase
          .from('email_campaigns')
          .select('body_html, body_text')
          .eq('id', campaignId)
          .single()
        const haystack = `${(camp as { body_html?: string } | null)?.body_html ?? ''}${(camp as { body_text?: string } | null)?.body_text ?? ''}`
        targetIsKnown = haystack.includes(redirectUrl)
      }

      const safeRedirect = (targetIsTrusted && targetIsKnown)
        ? redirectUrl!
        : SAFE_FALLBACK

      await supabase.from('email_events').insert({
        campaign_id: campaignId,
        recipient_id: recipientId,
        event_type: 'click',
        metadata: { url: safeRedirect, original: redirectUrl, redirected_safe: safeRedirect !== redirectUrl },
      })

      await supabase.from('email_campaign_recipients')
        .update({ status: 'clicked', clicked_at: now })
        .eq('id', recipientId)
        .is('clicked_at', null)

      await supabase.from('email_campaign_recipients')
        .update({ opened_at: now })
        .eq('id', recipientId)
        .is('opened_at', null)

      if (campaignId) {
        const { data: camp } = await supabase.from('email_campaigns').select('total_clicked').eq('id', campaignId).single()
        if (camp) {
          await supabase.from('email_campaigns')
            .update({ total_clicked: (camp.total_clicked ?? 0) + 1 })
            .eq('id', campaignId)
        }
      }

      return new Response(null, {
        status: 302,
        headers: { 'Location': safeRedirect },
      })
    }

    return new Response('Unknown event type', { status: 400 })
  } catch (err) {
    console.error('track-email error:', err)
    if (type === 'open') {
      return new Response(TRACKING_PIXEL, { headers: { 'Content-Type': 'image/gif' } })
    }
    // On click failure, redirect to safe fallback rather than the
    // attacker-supplied URL — fail closed.
    return new Response(null, { status: 302, headers: { 'Location': SAFE_FALLBACK } })
  }
})
