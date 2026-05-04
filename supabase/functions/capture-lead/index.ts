import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { rateLimitDb, rateLimitDbResponse } from '../_shared/rateLimit.ts'
import { corsHeadersFor } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// SHA-256 hash for CAPI user data
async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase())
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Build notes from message + custom answers
function buildNotes(
  message: string | undefined,
  answers: Record<string, string> | undefined,
  questions: Array<{ id: string; label: string }> | undefined
): string | null {
  const parts: string[] = []
  if (message) parts.push(message)
  if (answers && questions) {
    const qMap = new Map((questions ?? []).map(q => [q.id, q.label]))
    const answerLines = Object.entries(answers)
      .filter(([, v]) => v && v.length > 0)
      .map(([k, v]) => `${qMap.get(k) ?? k}: ${v}`)
    if (answerLines.length > 0) {
      parts.push('--- Reponses ---')
      parts.push(...answerLines)
    }
  }
  return parts.length > 0 ? parts.join('\n') : null
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // Rate limit by client IP — DB-backed so it works across edge
  // isolates (the previous in-memory Map let an attacker hit
  // N×10/min by hitting different isolates).
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'

  const rlSupabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const rlState = await rateLimitDb(rlSupabase, `capture-lead:${clientIp}`, 10, 60_000)
  const rlBlock = rateLimitDbResponse(rlState)
  if (rlBlock) {
    // Echo the allow-listed origin instead of '*' so the browser
    // can read the rate-limit message even when the request was
    // credentialed.
    for (const [k, v] of Object.entries(corsHeaders)) {
      rlBlock.headers.set(k, v)
    }
    return rlBlock
  }

  try {
    const body = await req.json()
    const {
      slug, full_name, phone, email, budget, unit_type, message,
      source_utm, utm_campaign, event_id, custom_answers,
    } = body as {
      slug: string
      full_name: string
      phone: string
      email?: string
      budget?: string
      unit_type?: string
      message?: string
      source_utm?: string
      /** utm_campaign param from the landing page URL — resolved to
       *  marketing_campaigns.id via tracking_code. */
      utm_campaign?: string
      event_id?: string
      custom_answers?: Record<string, string>
    }

    // Validate required fields
    if (!slug || !full_name || !phone) {
      return json({ error: 'slug, full_name and phone are required' }, 400)
    }

    // Anti-spam: honeypot field
    if (body.website_url) return json({ ok: true }) // bot trap

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Find the landing page by slug
    const { data: page, error: pageErr } = await supabase
      .from('landing_pages')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    if (pageErr || !page) {
      return json({ error: 'Landing page not found or inactive' }, 404)
    }

    // 2. Increment submission count. The RPC is declared in migration
    // 046 — was missing before, and the previous .catch() fallback
    // was a floating Promise that never actually awaited the update,
    // so the counter never moved.
    const { error: incErr } = await supabase.rpc('increment_landing_submissions', { page_id: page.id })
    if (incErr) {
      console.warn('[capture-lead] increment_landing_submissions failed:', incErr.message)
    }

    // 3. Determine agent based on distribution mode
    let assignedAgentId = page.default_agent_id

    if (page.distribution_mode === 'round_robin') {
      // Fetch active agents for this tenant
      const { data: agents } = await supabase
        .from('users')
        .select('id')
        .eq('tenant_id', page.tenant_id)
        .in('role', ['agent', 'admin'])
        .eq('status', 'active')
        .order('first_name')

      if (agents && agents.length > 0) {
        const idx = (page.last_assigned_agent_idx ?? 0) % agents.length
        assignedAgentId = agents[idx].id
        // Update index for next assignment
        await supabase.from('landing_pages')
          .update({ last_assigned_agent_idx: (idx + 1) % agents.length } as never)
          .eq('id', page.id)
      }
    } else if (page.distribution_mode === 'per_agent' && body.agent_slug) {
      // Agent-specific landing page link: /p/slug?agent=agent_id
      const { data: agent } = await supabase
        .from('users')
        .select('id')
        .eq('id', body.agent_slug)
        .eq('tenant_id', page.tenant_id)
        .single()
      if (agent) assignedAgentId = agent.id
    }

    // 4. Resolve utm_campaign tracking_code → campaign id (so the
    //    lead is linked to the campaign that generated it for ROI math).
    let marketingCampaignId: string | null = null
    if (utm_campaign) {
      const { data: camp } = await supabase
        .from('marketing_campaigns')
        .select('id')
        .eq('tenant_id', page.tenant_id)
        .ilike('tracking_code', utm_campaign.trim())
        .maybeSingle()
      marketingCampaignId = (camp as { id?: string } | null)?.id ?? null
    }

    // 5. Create client in pipeline
    const clientSource = source_utm || page.default_source || 'landing_page'
    const { data: newClient, error: clientErr } = await supabase
      .from('clients')
      .insert({
        tenant_id: page.tenant_id,
        agent_id: assignedAgentId,
        full_name,
        phone,
        email: email || null,
        confirmed_budget: budget ? Number(budget) : null,
        desired_unit_types: unit_type ? [unit_type] : null,
        interested_projects: page.project_id ? [page.project_id] : null,
        source: clientSource,
        marketing_campaign_id: marketingCampaignId,
        pipeline_stage: 'accueil',
        interest_level: 'medium',
        notes: buildNotes(message, custom_answers, page.custom_questions),
      })
      .select('id')
      .single()

    if (clientErr) {
      console.error('Client creation error:', clientErr)
      return json({ error: 'Failed to create lead' }, 500)
    }

    // 4. Log history
    await supabase.from('history').insert({
      tenant_id: page.tenant_id,
      client_id: newClient.id,
      agent_id: assignedAgentId,
      type: 'note',
      title: `Lead capture depuis landing page "${page.title}"`,
      metadata: { landing_page_id: page.id, slug, source: clientSource, custom_answers: custom_answers || null },
    })

    // 5. Create notification for the agent
    if (assignedAgentId) {
      await supabase.from('notifications').insert({
        tenant_id: page.tenant_id,
        user_id: assignedAgentId,
        type: 'new_lead',
        title: `Nouveau lead : ${full_name}`,
        message: `${phone} — via ${page.title}`,
        metadata: { client_id: newClient.id, landing_page_id: page.id },
      })
    }

    // 6. Server-side conversion tracking (CAPI)
    const evtId = event_id || crypto.randomUUID()
    const timestamp = Math.floor(Date.now() / 1000)
    const userIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
    const userAgent = req.headers.get('user-agent') || ''

    // 6a. Facebook Conversions API
    if (page.meta_pixel_id && page.meta_access_token) {
      try {
        const userData: Record<string, string> = {}
        if (email) userData.em = await sha256(email)
        if (phone) userData.ph = await sha256(phone.replace(/[\s\-\(\)]/g, ''))
        if (full_name) {
          const parts = full_name.trim().split(' ')
          if (parts[0]) userData.fn = await sha256(parts[0])
          if (parts[parts.length - 1]) userData.ln = await sha256(parts[parts.length - 1])
        }
        if (userIp) userData.client_ip_address = userIp
        if (userAgent) userData.client_user_agent = userAgent

        const fbPayload = {
          data: [{
            event_name: 'Lead',
            event_time: timestamp,
            event_id: evtId,
            event_source_url: `${supabaseUrl.replace('.supabase.co', '')}/p/${slug}`,
            action_source: 'website',
            user_data: userData,
          }],
          ...(page.meta_test_event_code ? { test_event_code: page.meta_test_event_code } : {}),
        }

        await fetch(`https://graph.facebook.com/v21.0/${page.meta_pixel_id}/events?access_token=${page.meta_access_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fbPayload),
        })
        console.log('[CAPI] Facebook Lead event sent')
      } catch (err) {
        console.error('[CAPI] Facebook error:', err)
      }
    }

    // 6b. Google Enhanced Conversions
    if (page.google_measurement_id && page.google_api_secret) {
      try {
        const gPayload = {
          client_id: crypto.randomUUID(),
          events: [{
            name: 'generate_lead',
            params: {
              event_id: evtId,
              currency: 'DZD',
              value: budget ? Number(budget) : 0,
            },
          }],
          user_data: {
            sha256_email_address: email ? [await sha256(email)] : [],
            sha256_phone_number: phone ? [await sha256(phone.replace(/[\s\-\(\)]/g, ''))] : [],
          },
        }

        await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${page.google_measurement_id}&api_secret=${page.google_api_secret}`, {
          method: 'POST',
          body: JSON.stringify(gPayload),
        })
        console.log('[CAPI] Google Lead event sent')
      } catch (err) {
        console.error('[CAPI] Google error:', err)
      }
    }

    // 6c. TikTok Events API
    if (page.tiktok_pixel_id && page.tiktok_access_token) {
      try {
        const ttPayload = {
          pixel_code: page.tiktok_pixel_id,
          event: 'SubmitForm',
          event_id: evtId,
          timestamp: new Date().toISOString(),
          context: {
            user_agent: userAgent,
            ip: userIp,
          },
          user: {
            email: email ? await sha256(email) : undefined,
            phone: phone ? await sha256(phone.replace(/[\s\-\(\)]/g, '')) : undefined,
          },
          properties: {
            content_type: 'product',
            currency: 'DZD',
            value: budget ? Number(budget) : 0,
          },
        }

        await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': page.tiktok_access_token,
          },
          body: JSON.stringify({ data: [ttPayload] }),
        })
        console.log('[CAPI] TikTok SubmitForm event sent')
      } catch (err) {
        console.error('[CAPI] TikTok error:', err)
      }
    }

    return json({
      ok: true,
      client_id: newClient.id,
      event_id: evtId,
      message: 'Lead captured successfully',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal:', msg)
    return json({ error: 'Internal server error' }, 500)
  }
})
