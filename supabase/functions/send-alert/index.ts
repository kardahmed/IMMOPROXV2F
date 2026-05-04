import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { requireServiceRole } from '../_shared/auth.ts'
import { corsHeadersFor } from '../_shared/cors.ts'

interface PlatformAlert {
  id: string
  type: string
  threshold: number
  channel: string
  webhook_url: string | null
  is_active: boolean
}

serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Service-role only — this endpoint triggers arbitrary outbound
    // webhooks (Slack, Telegram, custom HTTP) per the platform_alerts
    // config. Use the shared helper which decodes the JWT instead of
    // string-comparing it to SUPABASE_SERVICE_ROLE_KEY (which can drift
    // out of sync with the dashboard's current key after a rotation).
    const denied = requireServiceRole(req)
    if (denied) return denied

    // Fetch active alerts
    const { data: alerts } = await supabase.from('platform_alerts').select('*').eq('is_active', true)
    if (!alerts || alerts.length === 0) {
      return new Response(JSON.stringify({ message: 'No active alerts' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const results: Array<{ alert_type: string; triggered: boolean; message?: string }> = []

    for (const alert of alerts as PlatformAlert[]) {
      let triggered = false
      let message = ''

      switch (alert.type) {
        case 'payment_overdue': {
          const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'overdue')
          if ((count ?? 0) >= alert.threshold) {
            triggered = true
            message = `${count} factures en retard (seuil: ${alert.threshold})`
          }
          break
        }
        case 'tenant_inactive': {
          const cutoff = new Date(Date.now() - alert.threshold * 86400000).toISOString()
          const { data: inactive } = await supabase
            .from('tenants')
            .select('id, name')
            .lt('created_at', cutoff)
          // Check if any tenant has no recent user activity
          const inactiveCount = (inactive ?? []).length
          if (inactiveCount > 0) {
            triggered = true
            message = `${inactiveCount} tenant(s) potentiellement inactif(s) depuis ${alert.threshold}j`
          }
          break
        }
        case 'error_spike': {
          const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
          const { count } = await supabase.from('super_admin_logs').select('id', { count: 'exact', head: true }).eq('action', 'error').gte('created_at', oneDayAgo)
          if ((count ?? 0) >= alert.threshold) {
            triggered = true
            message = `${count} erreurs dans les dernieres 24h (seuil: ${alert.threshold})`
          }
          break
        }
        case 'error_logs_spike': {
          // React crashes captured by ErrorBoundary (migration 054).
          // High volume usually means a bad deploy or a regression.
          const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
          const { count } = await supabase.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo)
          if ((count ?? 0) >= alert.threshold) {
            triggered = true
            message = `${count} crashs front-end dans les 24h (seuil: ${alert.threshold}). Voir /admin/error-logs.`
          }
          break
        }
        case 'tenant_rate_pressure': {
          // Tenants currently hammering the write rate limit
          // (migration 053). Threshold = number of writes in the
          // current minute window. A normal tenant tops out around
          // 50; >250 is suspicious; >500 is hitting the wall.
          const { data: pressure } = await supabase
            .from('tenant_rate_pressure_view')
            .select('tenant_id, table_name, writes_in_window')
            .gte('writes_in_window', alert.threshold)
            .limit(5)
          const rows = (pressure ?? []) as Array<{ tenant_id: string; table_name: string; writes_in_window: number }>
          if (rows.length > 0) {
            triggered = true
            const summary = rows.map(r => `${r.table_name}=${r.writes_in_window}`).join(', ')
            message = `${rows.length} tenant(s) sous pression (${summary}). Possible bot/loop.`
          }
          break
        }
        case 'new_signup': {
          const oneDayAgo = new Date(Date.now() - 86400000).toISOString()
          const { count } = await supabase.from('tenants').select('id', { count: 'exact', head: true }).gte('created_at', oneDayAgo)
          if ((count ?? 0) >= alert.threshold) {
            triggered = true
            message = `${count} nouvelle(s) inscription(s) aujourd'hui`
          }
          break
        }
        case 'storage_limit': {
          const { data: settings } = await supabase.from('tenant_settings').select('tenant_id, storage_used_mb').gt('storage_used_mb', alert.threshold)
          if ((settings ?? []).length > 0) {
            triggered = true
            message = `${(settings ?? []).length} tenant(s) depasse(nt) ${alert.threshold}MB de stockage`
          }
          break
        }
      }

      if (triggered) {
        // Send notification based on channel
        if (alert.channel === 'email') {
          // Fetch platform support email
          const { data: platformSettings } = await supabase.from('platform_settings').select('support_email').limit(1).single()
          const email = (platformSettings as { support_email: string } | null)?.support_email
          if (email) {
            // Log the alert (email sending requires Resend/SMTP setup)
            await supabase.from('super_admin_logs').insert({
              action: 'alert_triggered',
              details: { type: alert.type, channel: 'email', message, to: email },
            })
          }
        } else if (alert.channel === 'telegram' && alert.webhook_url) {
          // Format: bot_token:chat_id
          const [botToken, chatId] = alert.webhook_url.split(':')
          if (botToken && chatId) {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `🚨 IMMO PRO-X Alerte\n\n${message}`,
                  parse_mode: 'HTML',
                }),
              })
            } catch {
              // Log telegram failure
              await supabase.from('super_admin_logs').insert({
                action: 'error',
                details: { message: `Telegram alert failed: ${alert.type}` },
              })
            }
          }
        } else if (alert.channel === 'slack' && alert.webhook_url) {
          try {
            await fetch(alert.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `🚨 *IMMO PRO-X Alerte*\n${message}`,
                blocks: [
                  { type: 'header', text: { type: 'plain_text', text: '🚨 IMMO PRO-X Alerte' } },
                  { type: 'section', text: { type: 'mrkdwn', text: `*Type:* ${alert.type}\n*Message:* ${message}\n*Seuil:* ${alert.threshold}` } },
                ],
              }),
            })
          } catch {
            await supabase.from('super_admin_logs').insert({
              action: 'error',
              details: { message: `Slack alert failed: ${alert.type}` },
            })
          }
        } else if (alert.channel === 'discord' && alert.webhook_url) {
          try {
            await fetch(alert.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `🚨 **IMMO PRO-X Alerte**`,
                embeds: [{
                  title: alert.type,
                  description: message,
                  color: 0xCD3D64,
                  fields: [{ name: 'Seuil', value: String(alert.threshold), inline: true }],
                  timestamp: new Date().toISOString(),
                }],
              }),
            })
          } catch {
            await supabase.from('super_admin_logs').insert({
              action: 'error',
              details: { message: `Discord alert failed: ${alert.type}` },
            })
          }
        } else if (alert.channel === 'webhook' && alert.webhook_url) {
          try {
            await fetch(alert.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: alert.type,
                message,
                threshold: alert.threshold,
                timestamp: new Date().toISOString(),
                source: 'IMMO PRO-X',
              }),
            })
          } catch {
            await supabase.from('super_admin_logs').insert({
              action: 'error',
              details: { message: `Webhook alert failed: ${alert.type}`, url: alert.webhook_url },
            })
          }
        }
      }

      results.push({ alert_type: alert.type, triggered, message: message || undefined })
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
