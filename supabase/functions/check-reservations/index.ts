import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmailInternal } from '../_shared/send-email-internal.ts'
import { dispatchAutomation } from '../_shared/dispatchAutomation.ts'
import { isAuthorizedCron, unauthorizedResponse } from '../_shared/cronAuth.ts'

const FR_MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return unauthorizedResponse()

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // 0. New reservations confirmed in the last hour — dispatch the
    //    `reservation_confirmation` Utility template to the client via
    //    dispatchAutomation. Idempotent (related_id = reservation.id) so
    //    re-running the cron won't double-send. The 1h window is wide
    //    enough that an hourly cron always picks up fresh ones.
    const oneHourAgo = new Date(Date.now() - 1 * 3600 * 1000).toISOString()
    const { data: newReservations } = await supabase
      .from('reservations')
      .select(`
        id, tenant_id, client_id, agent_id, created_at,
        clients(full_name, phone),
        units(code, type, subtype),
        projects(name),
        users!reservations_agent_id_fkey(first_name, last_name, phone)
      `)
      .eq('status', 'active')
      .gte('created_at', oneHourAgo)

    let confirmationDispatches = 0
    for (const r of newReservations ?? []) {
      const client = (r as Record<string, unknown>).clients as { full_name: string; phone: string | null } | null
      const unit = (r as Record<string, unknown>).units as { code: string; type: string | null; subtype: string | null } | null
      const project = (r as Record<string, unknown>).projects as { name: string } | null
      const agent = (r as Record<string, unknown>).users as { first_name: string; last_name: string; phone: string | null } | null

      const createdDate = new Date(r.created_at as string)
      const dateFr = `${createdDate.getDate()} ${FR_MONTHS[createdDate.getMonth()]} ${createdDate.getFullYear()}`
      // Compose human-readable unit label from type + subtype, fall back
      // to the unit code if type info is missing.
      const unitLabel = unit?.subtype || unit?.type || unit?.code || '-'
      const lotCode = unit?.code ?? '-'
      const agentLine = agent ? `${agent.first_name} ${agent.last_name}${agent.phone ? ' - ' + agent.phone : ''}` : 'Contactez votre agence'

      const result = await dispatchAutomation({
        supabase,
        tenantId: r.tenant_id,
        clientId: r.client_id,
        agentId: r.agent_id,
        templateName: 'reservation_confirmation',
        templateParams: [
          client?.full_name ?? '-',
          unitLabel,
          lotCode,
          project?.name ?? '-',
          dateFr,
          agentLine,
        ],
        clientPhone: client?.phone ?? null,
        fallbackTaskTitle: `Confirmer reservation ${lotCode} a ${client?.full_name ?? 'client'}`,
        fallbackDueAt: new Date(Date.now() + 2 * 3600 * 1000),
        relatedId: r.id,
        relatedType: 'reservation',
        triggerSource: 'cron_check_reservations_confirmation',
      })
      if (result.path === 'whatsapp' || result.path === 'task') confirmationDispatches++
    }

    // 1. Find expired reservations with client/unit details for email
    const { data: expired, error: fetchErr } = await supabase
      .from('reservations')
      .select('id, tenant_id, client_id, unit_id, agent_id, clients(full_name), units(code)')
      .eq('status', 'active')
      .lt('expires_at', new Date().toISOString())

    if (fetchErr) {
      console.error('Fetch error:', fetchErr)
      return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
    }

    if (!expired || expired.length === 0) {
      return new Response(JSON.stringify({
        message: 'No expired reservations',
        count: 0,
        confirmation_dispatches: confirmationDispatches,
      }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`Found ${expired.length} expired reservation(s)`)

    // Fetch agent emails for notifications
    const agentIds = [...new Set(expired.map(r => r.agent_id).filter(Boolean))] as string[]
    const { data: agentUsers } = agentIds.length > 0
      ? await supabase.from('users').select('id, email').in('id', agentIds)
      : { data: [] }

    const agentEmailMap = new Map<string, string>()
    for (const u of agentUsers ?? []) {
      if (u.email) agentEmailMap.set(u.id, u.email)
    }

    let processed = 0
    let emailsSent = 0
    const errors: string[] = []

    for (const reservation of expired) {
      const client = (reservation as Record<string, unknown>).clients as { full_name: string } | null
      const unit = (reservation as Record<string, unknown>).units as { code: string } | null

      try {
        // a. Expire the reservation
        const { error: expireErr } = await supabase
          .from('reservations')
          .update({ status: 'expired' })
          .eq('id', reservation.id)

        if (expireErr) throw new Error(`Expire reservation ${reservation.id}: ${expireErr.message}`)

        // b. Free the unit
        const { error: unitErr } = await supabase
          .from('units')
          .update({ status: 'available', client_id: null })
          .eq('id', reservation.unit_id)

        if (unitErr) throw new Error(`Free unit ${reservation.unit_id}: ${unitErr.message}`)

        // c. Log history
        const { error: histErr } = await supabase
          .from('history')
          .insert({
            tenant_id: reservation.tenant_id,
            client_id: reservation.client_id,
            agent_id: null,
            type: 'stage_change',
            title: 'Reservation expiree — client passe en relancement',
            description: `Reservation ${reservation.id} expiree automatiquement`,
            metadata: {
              reservation_id: reservation.id,
              unit_id: reservation.unit_id,
              from: 'reservation',
              to: 'relancement',
              auto: true,
            },
          })

        if (histErr) throw new Error(`History ${reservation.id}: ${histErr.message}`)

        // d. Move client to relancement
        const { error: clientErr } = await supabase
          .from('clients')
          .update({ pipeline_stage: 'relancement' })
          .eq('id', reservation.client_id)
          .eq('pipeline_stage', 'reservation')

        if (clientErr) throw new Error(`Client ${reservation.client_id}: ${clientErr.message}`)

        // e. Send email notification to the agent
        if (reservation.agent_id) {
          const agentEmail = agentEmailMap.get(reservation.agent_id)
          if (agentEmail) {
            const result = await sendEmailInternal({
              to: agentEmail,
              template: 'reservation_expired',
              template_data: {
                client_name: client?.full_name ?? '-',
                unit_code: unit?.code ?? '-',
                reservation_id: reservation.id,
              },
              tenant_id: reservation.tenant_id,
              client_id: reservation.client_id,
            })
            if (result.sent) emailsSent++
          }
        }

        processed++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(msg)
        errors.push(msg)
      }
    }

    const result = {
      message: `Processed ${processed}/${expired.length} expired reservations, dispatched ${confirmationDispatches} confirmation(s)`,
      processed,
      total: expired.length,
      emails_sent: emailsSent,
      confirmation_dispatches: confirmationDispatches,
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
