import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkPlanFeature } from '../_shared/checkPlanFeature.ts'
import { trackWhatsAppCost } from '../_shared/trackCost.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization' }, 401)

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Verify user
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    // Get tenant
    const { data: profile } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
    if (!profile?.tenant_id) return json({ error: 'No tenant' }, 403)

    // Plan + tenant feature gate
    const featureCheck = await checkPlanFeature(supabase, profile.tenant_id, 'whatsapp')
    if (!featureCheck.allowed) {
      return json({
        error: featureCheck.reason === 'plan'
          ? `WhatsApp n'est pas inclus dans votre plan (${featureCheck.plan}). Contactez l'administrateur IMMO PRO-X.`
          : `WhatsApp a été désactivé par l'administrateur de votre agence. Réactivez-le dans /settings.`,
        reason: featureCheck.reason,
        plan: featureCheck.plan,
      }, 403)
    }

    // Check WhatsApp is active for this tenant
    const { data: waAccount } = await supabase
      .from('whatsapp_accounts')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .single()

    if (!waAccount) return json({ error: 'WhatsApp non activé pour votre agence. Contactez l\'administrateur.' }, 403)

    // Check quota
    const account = waAccount as unknown as { monthly_quota: number; messages_sent: number; plan: string }
    if (account.messages_sent >= account.monthly_quota) {
      return json({ error: `Quota WhatsApp atteint (${account.messages_sent}/${account.monthly_quota}). Passez au pack supérieur.` }, 429)
    }

    // Get platform WhatsApp config
    const { data: waConfig } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single()

    if (!waConfig) return json({ error: 'WhatsApp non configuré sur la plateforme.' }, 503)

    const config = waConfig as unknown as { phone_number_id: string; access_token: string }

    // Parse request — supports two modes:
    //   1. template_name + variables  (cold outreach, any time)
    //   2. body_text                  (reply within 24h conversation
    //                                  window; free-form text)
    // If task_id is set, we mark the task as executed_at=now() after a
    // successful send (step C — task↔reality loop). The webhook will
    // later auto-close it when the client replies.
    const { to, template_name, variables, body_text, client_id, task_id } = await req.json() as {
      to: string
      template_name?: string
      variables?: string[]
      body_text?: string
      client_id?: string
      task_id?: string
    }

    if (!to) return json({ error: 'to required' }, 400)
    if (!template_name && !body_text) {
      return json({ error: 'template_name OR body_text required' }, 400)
    }
    if (template_name && body_text) {
      return json({ error: 'pass either template_name or body_text, not both' }, 400)
    }

    // Clean phone number (ensure format: 213XXXXXXXXX)
    let phone = to.replace(/[\s\-\(\)\+]/g, '')
    if (phone.startsWith('0')) phone = '213' + phone.slice(1)
    if (!phone.startsWith('213')) phone = '213' + phone

    // Build the Meta payload — template OR free-form text
    const metaPayload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: phone,
    }
    if (body_text) {
      metaPayload.type = 'text'
      metaPayload.text = { body: body_text }
    } else {
      const components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> = []
      if (variables && variables.length > 0) {
        components.push({
          type: 'body',
          parameters: variables.map(v => ({ type: 'text', text: v })),
        })
      }
      metaPayload.type = 'template'
      metaPayload.template = {
        name: template_name,
        language: { code: 'fr' },
        ...(components.length > 0 ? { components } : {}),
      }
    }

    // Send via Meta Cloud API
    const response = await fetch(`https://graph.facebook.com/v25.0/${config.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.access_token}`,
      },
      body: JSON.stringify(metaPayload),
    })

    const result = await response.json()

    if (!response.ok) {
      // Log failed message
      await supabase.from('whatsapp_messages').insert({
        tenant_id: profile.tenant_id,
        client_id: client_id ?? null,
        agent_id: user.id,
        template_name: template_name ?? null,
        to_phone: phone,
        body_text: body_text ?? null,
        message_type: body_text ? 'text' : 'template',
        direction: 'outbound',
        variables: variables ?? [],
        status: 'failed',
        error_message: result.error?.message ?? 'Unknown error',
      })

      console.error('WhatsApp API error:', result)
      return json({ error: result.error?.message ?? 'WhatsApp send failed' }, 502)
    }

    const waMessageId = result.messages?.[0]?.id ?? null

    // Log successful message
    await supabase.from('whatsapp_messages').insert({
      tenant_id: profile.tenant_id,
      client_id: client_id ?? null,
      agent_id: user.id,
      template_name: template_name ?? null,
      to_phone: phone,
      body_text: body_text ?? null,
      message_type: body_text ? 'text' : 'template',
      direction: 'outbound',
      variables: variables ?? [],
      wa_message_id: waMessageId,
      status: 'sent',
    })

    await trackWhatsAppCost(supabase, 1, {
      tenantId: profile.tenant_id,
      operation: body_text ? 'whatsapp-text' : 'whatsapp-template',
      metadata: { template: template_name ?? null, type: body_text ? 'text' : 'template' },
    })

    // Mark task as executed (step C — task↔reality loop). The
    // whatsapp-webhook will later auto-close it when the client replies.
    if (task_id) {
      await supabase.from('tasks').update({
        executed_at: new Date().toISOString(),
        message_sent: body_text ?? null,
      } as never).eq('id', task_id).eq('tenant_id', profile.tenant_id)
    }

    // Increment tenant message counter
    await supabase
      .from('whatsapp_accounts')
      .update({ messages_sent: account.messages_sent + 1 } as never)
      .eq('tenant_id', profile.tenant_id)

    // Log in client history if client_id provided
    if (client_id) {
      const historyTitle = body_text
        ? `WhatsApp envoye: ${body_text.slice(0, 60)}${body_text.length > 60 ? '...' : ''}`
        : `WhatsApp envoye: ${template_name}`
      await supabase.from('history').insert({
        tenant_id: profile.tenant_id,
        client_id,
        agent_id: user.id,
        type: 'whatsapp_message',
        title: historyTitle,
        metadata: { wa_message_id: waMessageId, template: template_name ?? null, body_text: body_text ?? null, to: phone },
      } as never)

      // Update last contact
      await supabase.from('clients').update({ last_contact_at: new Date().toISOString() } as never).eq('id', client_id)
    }

    return json({
      success: true,
      message_id: waMessageId,
      to: phone,
      template: template_name ?? null,
      body_text: body_text ?? null,
      task_executed: task_id ? true : false,
      remaining: account.monthly_quota - account.messages_sent - 1,
    })
  } catch (err) {
    console.error('Fatal:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})
