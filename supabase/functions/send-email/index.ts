import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabase = createClient(supabaseUrl, serviceKey)

    const { type, to, subject, body, tenant_id, client_id, metadata } = await req.json()

    // Validate
    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Missing: to, subject, body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get platform settings for from email
    const { data: settings } = await supabase.from('platform_settings').select('support_email, platform_name').limit(1).single()
    const fromName = (settings as { platform_name: string } | null)?.platform_name ?? 'IMMO PRO-X'
    const fromEmail = (settings as { support_email: string } | null)?.support_email ?? 'noreply@immoprox.com'

    let sent = false
    let provider = 'none'

    // Try Resend if configured
    if (resendApiKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [to],
          subject,
          html: `
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
            </div>
          `,
        }),
      })

      if (res.ok) {
        sent = true
        provider = 'resend'
      }
    }

    // Log the email
    await supabase.from('notifications').insert({
      tenant_id: tenant_id ?? null,
      type: 'email_sent',
      title: `Email: ${subject}`,
      message: `Envoye a ${to} via ${provider}`,
    })

    // Log in audit
    if (tenant_id) {
      await supabase.from('history').insert({
        tenant_id,
        client_id: client_id ?? null,
        type: 'email',
        title: `Email envoye: ${subject}`,
        description: `Destinataire: ${to}`,
      })
    }

    return new Response(JSON.stringify({ sent, provider, to, subject }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
