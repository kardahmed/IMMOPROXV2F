// Supabase Edge Function: emit-webhook
// Dispatches an event to all active webhooks subscribed to it for a given tenant.
// Signs the payload with HMAC-SHA256 using each webhook's secret.
// Logs every delivery (success/failure) in webhook_deliveries.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmitBody {
  tenant_id: string
  event_type: string
  payload: Record<string, unknown>
}

async function hmacSha256(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const { tenant_id, event_type, payload } = await req.json() as EmitBody
    if (!tenant_id || !event_type) {
      return jsonErr('Missing tenant_id or event_type', 400)
    }

    // Fetch active webhooks subscribed to this event for this tenant
    const { data: hooks, error: hookErr } = await admin
      .from('webhooks')
      .select('id, url, secret, events')
      .eq('tenant_id', tenant_id)
      .eq('active', true)
      .contains('events', [event_type])

    if (hookErr) return jsonErr(hookErr.message, 500)
    if (!hooks || hooks.length === 0) {
      return new Response(JSON.stringify({ ok: true, delivered: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = JSON.stringify({
      event: event_type,
      tenant_id,
      data: payload,
      timestamp: new Date().toISOString(),
    })

    // Fire-and-forget deliveries in parallel with a 5s timeout each
    const results = await Promise.allSettled(hooks.map(async (h) => {
      const signature = await hmacSha256(h.secret, body)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      let status = 0
      let responseBody = ''
      let success = false
      try {
        const resp = await fetch(h.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-IMMO-Signature': `sha256=${signature}`,
            'X-IMMO-Event': event_type,
            'X-IMMO-Webhook-Id': h.id,
          },
          body,
          signal: controller.signal,
        })
        status = resp.status
        responseBody = (await resp.text()).slice(0, 2000)
        success = resp.ok
      } catch (err) {
        responseBody = (err as Error).message ?? 'Network error'
      } finally {
        clearTimeout(timeoutId)
      }

      await admin.from('webhook_deliveries').insert({
        webhook_id: h.id,
        event_type,
        payload: JSON.parse(body),
        response_status: status || null,
        response_body: responseBody || null,
        success,
      } as never)

      return { webhook_id: h.id, success, status }
    }))

    const delivered = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    return new Response(JSON.stringify({ ok: true, delivered, total: hooks.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return jsonErr((err as Error).message ?? 'Internal error', 500)
  }
})

function jsonErr(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
