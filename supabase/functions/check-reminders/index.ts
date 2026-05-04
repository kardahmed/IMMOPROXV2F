import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmailInternal } from '../_shared/send-email-internal.ts'
import { dispatchAutomation } from '../_shared/dispatchAutomation.ts'
import { isAuthorizedCron, unauthorizedResponse } from '../_shared/cronAuth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Format an ISO date as "mardi 24 mai 2026" for French template variables.
const FR_DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const FR_MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']
function formatFrenchDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = `${FR_DAYS[d.getDay()]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const time = `${d.getHours().toString().padStart(2, '0')}h${d.getMinutes().toString().padStart(2, '0')}`
  return { date, time }
}

Deno.serve(async (req) => {
  if (!isAuthorizedCron(req)) return unauthorizedResponse()

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const now = new Date()
    const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0]
    const twoDaysFromNow = new Date(now.getTime() + 2 * 86400000).toISOString()
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString()
    const notifications: Array<{ tenant_id: string; user_id: string | null; type: string; title: string; message: string; metadata: Record<string, unknown> }> = []

    // Collect email tasks to send after creating notifications
    const emailTasks: Array<{
      agent_id: string | null
      tenant_id: string
      template: 'payment_reminder' | 'reservation_expiring' | 'client_relaunch'
      template_data: Record<string, unknown>
      client_id?: string
    }> = []

    // 1. Payment reminders (due in 3 days)
    //    Also dispatches the `paiement_echeance_j_moins_3` Utility template
    //    to the client via dispatchAutomation. The agent-facing email is
    //    kept (existing behavior) — this adds a parallel, client-facing
    //    channel.
    const { data: upcomingPayments } = await supabase
      .from('payment_schedules')
      .select(`
        id, tenant_id, amount, due_date, installment_number,
        sales(
          agent_id, client_id,
          clients(full_name, phone),
          units(code),
          users!sales_agent_id_fkey(first_name, last_name, phone)
        )
      `)
      .eq('status', 'pending')
      .lte('due_date', threeDaysFromNow)
      .gte('due_date', now.toISOString().split('T')[0])

    for (const p of upcomingPayments ?? []) {
      const sale = p.sales as {
        agent_id: string
        client_id: string
        clients: { full_name: string; phone: string | null } | null
        units: { code: string } | null
        users: { first_name: string; last_name: string; phone: string | null } | null
      } | null
      const daysUntilDue = Math.ceil((new Date(p.due_date).getTime() - now.getTime()) / 86400000)

      notifications.push({
        tenant_id: p.tenant_id,
        user_id: sale?.agent_id ?? null,
        type: 'payment_reminder',
        title: `Echeance #${p.installment_number} dans ${daysUntilDue}j`,
        message: `${sale?.clients?.full_name ?? '-'} — ${sale?.units?.code ?? '-'} — ${p.amount} DA`,
        metadata: { payment_id: p.id, due_date: p.due_date },
      })

      emailTasks.push({
        agent_id: sale?.agent_id ?? null,
        tenant_id: p.tenant_id,
        template: 'payment_reminder',
        template_data: {
          client_name: sale?.clients?.full_name ?? '-',
          unit_code: sale?.units?.code ?? '-',
          installment_number: p.installment_number,
          amount: p.amount,
          due_date: p.due_date,
          days_until_due: daysUntilDue,
        },
      })

      // Client-facing WhatsApp dispatch — only for payments due ≥ 2 days out
      // so the J-3 template fires once on its proper window. dispatchAutomation
      // is idempotent (related_id = payment_schedule.id) so the cron can
      // re-run hourly without spamming.
      if (sale && daysUntilDue >= 2) {
        const dueDateFr = `${new Date(p.due_date).getDate()} ${FR_MONTHS[new Date(p.due_date).getMonth()]} ${new Date(p.due_date).getFullYear()}`
        const dossierRef = `DOS-${p.id.slice(0, 8).toUpperCase()}`
        const agent = sale.users
        const agentLine = agent ? `${agent.first_name} ${agent.last_name}${agent.phone ? ' - ' + agent.phone : ''}` : 'Contactez votre agence'

        await dispatchAutomation({
          supabase,
          tenantId: p.tenant_id,
          clientId: sale.client_id,
          agentId: sale.agent_id,
          templateName: 'paiement_echeance_j_moins_3',
          templateParams: [
            sale.clients?.full_name ?? '-',
            new Intl.NumberFormat('fr-FR').format(p.amount),
            dueDateFr,
            dossierRef,
            // RIB — no dedicated field on tenants yet. Falls back to a
            // generic line; can be replaced once we add a bank_rib field
            // to tenant_settings.
            'Contactez votre conseiller : ' + agentLine,
          ],
          clientPhone: sale.clients?.phone ?? null,
          fallbackTaskTitle: `Rappeler echeance ${dossierRef} a ${sale.clients?.full_name ?? 'client'}`,
          fallbackDueAt: new Date(now.getTime() + 6 * 3600 * 1000),
          relatedId: p.id,
          relatedType: 'payment',
          triggerSource: 'cron_check_reminders_payment_j_minus_3',
        })
      }
    }

    // 2. Expiring reservations (in 2 days)
    const { data: expiringRes } = await supabase
      .from('reservations')
      .select('id, tenant_id, agent_id, client_id, expires_at, clients(full_name), units(code)')
      .eq('status', 'active')
      .lte('expires_at', twoDaysFromNow)

    for (const r of expiringRes ?? []) {
      const client = (r as Record<string, unknown>).clients as { full_name: string } | null
      const unit = (r as Record<string, unknown>).units as { code: string } | null

      notifications.push({
        tenant_id: r.tenant_id,
        user_id: r.agent_id,
        type: 'reservation_expiring',
        title: `Reservation expire bientot`,
        message: `${client?.full_name ?? '-'} — ${unit?.code ?? '-'}`,
        metadata: { reservation_id: r.id, expires_at: r.expires_at },
      })

      emailTasks.push({
        agent_id: r.agent_id,
        tenant_id: r.tenant_id,
        template: 'reservation_expiring',
        template_data: {
          client_name: client?.full_name ?? '-',
          unit_code: unit?.code ?? '-',
          expires_at: r.expires_at,
        },
        client_id: r.client_id,
      })
    }

    // 3. Clients without contact for 3+ days
    const { data: staleClients } = await supabase
      .from('clients')
      .select('id, tenant_id, agent_id, full_name, last_contact_at, pipeline_stage')
      .lt('last_contact_at', threeDaysAgo)
      .not('pipeline_stage', 'in', '("vente","perdue")')

    for (const c of staleClients ?? []) {
      const days = Math.floor((now.getTime() - new Date(c.last_contact_at).getTime()) / 86400000)

      notifications.push({
        tenant_id: c.tenant_id,
        user_id: c.agent_id,
        type: 'client_relaunch',
        title: `Client a relancer (${days}j sans contact)`,
        message: c.full_name,
        metadata: { client_id: c.id, days_since_contact: days },
      })

      emailTasks.push({
        agent_id: c.agent_id,
        tenant_id: c.tenant_id,
        template: 'client_relaunch',
        template_data: {
          client_name: c.full_name,
          days_since_contact: days,
          pipeline_stage: c.pipeline_stage,
        },
        client_id: c.id,
      })
    }

    // 4. Visite J-1 confirmation + H-2 rappel
    //    Fires the approved Utility templates `visite_confirmation_j_moins_1`
    //    and `visite_rappel_h_moins_2` via dispatchAutomation. dispatchAutomation
    //    picks between sending WhatsApp directly (if tenant has active
    //    whatsapp_accounts) or creating a fallback task for the agent.
    //    Idempotency via the related_id = visit.id — re-running the cron
    //    within the same window won't duplicate dispatches.
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 3600 * 1000)
    const twentyFiveHoursFromNow = new Date(now.getTime() + 25 * 3600 * 1000)
    const oneHourFromNow = new Date(now.getTime() + 1 * 3600 * 1000)
    const threeHoursFromNow = new Date(now.getTime() + 3 * 3600 * 1000)

    // J-1: visits scheduled 24-25h from now (cron runs hourly)
    const { data: visitsJ1 } = await supabase
      .from('visits')
      .select(`
        id, tenant_id, agent_id, client_id, scheduled_at,
        clients!inner(full_name, phone),
        projects(name),
        users!visits_agent_id_fkey(first_name, last_name, phone)
      `)
      .eq('status', 'planned')
      .gte('scheduled_at', twentyFourHoursFromNow.toISOString())
      .lt('scheduled_at', twentyFiveHoursFromNow.toISOString())
      .is('deleted_at', null)

    // H-2: visits scheduled 1-3h from now (we use 1h window within the 3h
    // lookahead to hit each visit exactly once when the cron runs hourly)
    const { data: visitsH2 } = await supabase
      .from('visits')
      .select(`
        id, tenant_id, agent_id, client_id, scheduled_at,
        clients!inner(full_name, phone),
        projects(name),
        users!visits_agent_id_fkey(first_name, last_name, phone)
      `)
      .eq('status', 'planned')
      .gte('scheduled_at', oneHourFromNow.toISOString())
      .lt('scheduled_at', threeHoursFromNow.toISOString())
      .is('deleted_at', null)

    const dispatched = { confirmations_j1: 0, rappels_h2: 0, via_whatsapp: 0, via_task: 0, skipped: 0 }

    for (const v of visitsJ1 ?? []) {
      const client = v.clients as { full_name: string; phone: string } | null
      const project = v.projects as { name: string } | null
      const agent = v.users as { first_name: string; last_name: string; phone: string } | null
      const { date, time } = formatFrenchDateTime(v.scheduled_at as string)
      const agentLine = agent ? `${agent.first_name} ${agent.last_name}${agent.phone ? ' - ' + agent.phone : ''}` : '-'

      const result = await dispatchAutomation({
        supabase,
        tenantId: v.tenant_id,
        clientId: v.client_id,
        agentId: v.agent_id,
        templateName: 'visite_confirmation_j_moins_1',
        templateParams: [
          client?.full_name ?? '-',
          date,
          time,
          project?.name ?? '-',
          agentLine,
        ],
        clientPhone: client?.phone ?? null,
        fallbackTaskTitle: `Envoyer WhatsApp de confirmation visite a ${client?.full_name ?? 'client'}`,
        fallbackDueAt: new Date(new Date(v.scheduled_at as string).getTime() - 20 * 3600 * 1000),
        relatedId: v.id,
        relatedType: 'visit',
        triggerSource: 'cron_check_reminders_visit_j_minus_1',
      })

      dispatched.confirmations_j1++
      if (result.path === 'whatsapp') dispatched.via_whatsapp++
      else if (result.path === 'task') dispatched.via_task++
      else dispatched.skipped++
    }

    for (const v of visitsH2 ?? []) {
      const client = v.clients as { full_name: string; phone: string } | null
      const project = v.projects as { name: string } | null
      const agent = v.users as { first_name: string; last_name: string; phone: string } | null
      const { time } = formatFrenchDateTime(v.scheduled_at as string)
      const agentLine = agent ? `${agent.first_name} ${agent.last_name}${agent.phone ? ' - ' + agent.phone : ''}` : '-'

      const result = await dispatchAutomation({
        supabase,
        tenantId: v.tenant_id,
        clientId: v.client_id,
        agentId: v.agent_id,
        templateName: 'visite_rappel_h_moins_2',
        templateParams: [
          client?.full_name ?? '-',
          time,
          project?.name ?? '-',
          agentLine,
        ],
        clientPhone: client?.phone ?? null,
        fallbackTaskTitle: `Envoyer WhatsApp rappel visite a ${client?.full_name ?? 'client'}`,
        fallbackDueAt: new Date(new Date(v.scheduled_at as string).getTime() - 1 * 3600 * 1000),
        relatedId: v.id,
        relatedType: 'visit',
        triggerSource: 'cron_check_reminders_visit_h_minus_2',
      })

      dispatched.rappels_h2++
      if (result.path === 'whatsapp') dispatched.via_whatsapp++
      else if (result.path === 'task') dispatched.via_task++
      else dispatched.skipped++
    }

    // Insert notifications
    let inserted = 0
    for (const n of notifications) {
      const { error } = await supabase.from('notifications').insert(n)
      if (!error) inserted++
    }

    // Send emails to agents
    let emailsSent = 0

    // Collect unique agent IDs to fetch their emails
    const agentIds = [...new Set(emailTasks.map(t => t.agent_id).filter(Boolean))] as string[]

    const { data: agentUsers } = agentIds.length > 0
      ? await supabase.from('users').select('id, email').in('id', agentIds)
      : { data: [] }

    const agentEmailMap = new Map<string, string>()
    for (const u of agentUsers ?? []) {
      if (u.email) agentEmailMap.set(u.id, u.email)
    }

    // Check tenant notification preferences
    const tenantIds = [...new Set(emailTasks.map(t => t.tenant_id))]
    const { data: tenantSettings } = tenantIds.length > 0
      ? await supabase.from('tenant_settings').select('tenant_id, notif_payment_due, notif_reservation_expiry').in('tenant_id', tenantIds)
      : { data: [] }

    const settingsMap = new Map<string, Record<string, boolean>>()
    for (const s of tenantSettings ?? []) {
      settingsMap.set(s.tenant_id, s as Record<string, boolean>)
    }

    for (const task of emailTasks) {
      if (!task.agent_id) continue
      const email = agentEmailMap.get(task.agent_id)
      if (!email) continue

      // Check tenant notification preferences
      const ts = settingsMap.get(task.tenant_id)
      if (task.template === 'payment_reminder' && ts?.notif_payment_due === false) continue
      if (task.template === 'reservation_expiring' && ts?.notif_reservation_expiry === false) continue

      const result = await sendEmailInternal({
        to: email,
        template: task.template,
        template_data: task.template_data,
        tenant_id: task.tenant_id,
        client_id: task.client_id,
      })
      if (result.sent) emailsSent++
    }

    return new Response(JSON.stringify({
      message: `Created ${inserted} notification(s), sent ${emailsSent} email(s), dispatched ${dispatched.confirmations_j1 + dispatched.rappels_h2} visit reminder(s)`,
      visit_automation: dispatched,
      breakdown: {
        payment_reminders: notifications.filter(n => n.type === 'payment_reminder').length,
        reservation_expiring: notifications.filter(n => n.type === 'reservation_expiring').length,
        client_relaunch: notifications.filter(n => n.type === 'client_relaunch').length,
      },
      emails_sent: emailsSent,
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
