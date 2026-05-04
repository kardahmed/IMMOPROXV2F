// ─── check-abandoned-leads ────────────────────────────────────────────────
// Re-engages leads who started but did not finish the /contact form.
//
// Logic:
//   1. Find marketing_leads where step_completed = 1 (only step 1 done)
//      AND drip_sent_at IS NULL (never re-engaged)
//      AND status NOT IN ('won', 'lost') (manual decisions take priority)
//      AND created_at < now() - 6h (give them time to come back on their own)
//   2. For each, send the lead_drip email via Resend.
//   3. Mark drip_sent_at = now() so the same lead is not re-emailed.
//
// Schedule: hourly via pg_cron — see migration 027_cron_check_abandoned_leads.sql.
//
// Auth: cron calls in via Bearer SUPABASE_SERVICE_ROLE_KEY (no public access).
// ──────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmailInternal } from '../_shared/send-email-internal.ts'
import { isAuthorizedCron, unauthorizedResponse } from '../_shared/cronAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const STALE_HOURS = 6
const CONTACT_URL = 'https://immoprox.io/contact'

interface LeadRow {
  id: string
  full_name: string
  email: string
}

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return unauthorizedResponse()

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString()

  try {
    const { data: leads, error: fetchErr } = await supabase
      .from('marketing_leads')
      .select('id, full_name, email')
      .eq('step_completed', 1)
      .is('drip_sent_at', null)
      .not('status', 'in', '(won,lost)')
      .lt('created_at', cutoff)
      .returns<LeadRow[]>()

    if (fetchErr) {
      console.error('Fetch error:', fetchErr)
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
    }

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ message: 'No abandoned leads to drip', count: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    let emailsSent = 0
    const errors: string[] = []

    for (const lead of leads) {
      const firstName = (lead.full_name ?? '').trim().split(/\s+/)[0] || 'bonjour'

      const result = await sendEmailInternal({
        to: lead.email,
        template: 'lead_drip',
        template_data: {
          first_name: firstName,
          contact_url: CONTACT_URL,
        },
      })

      if (!result.sent) {
        errors.push(`${lead.email}: ${result.error ?? 'unknown'}`)
        continue
      }

      const { error: markErr } = await supabase
        .from('marketing_leads')
        .update({ drip_sent_at: new Date().toISOString() })
        .eq('id', lead.id)

      if (markErr) {
        errors.push(`mark ${lead.id}: ${markErr.message}`)
        continue
      }

      emailsSent++
    }

    const result = {
      message: `Dripped ${emailsSent}/${leads.length} abandoned leads`,
      count: leads.length,
      emails_sent: emailsSent,
      errors: errors.length > 0 ? errors : undefined,
    }

    console.log(result.message)

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})
