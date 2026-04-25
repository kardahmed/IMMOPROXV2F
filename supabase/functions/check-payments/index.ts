import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmailInternal } from '../_shared/send-email-internal.ts'
import { dispatchAutomation } from '../_shared/dispatchAutomation.ts'

const FR_MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Verify authorization: must provide service role key as Bearer token
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${supabaseServiceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // 1. Atomically mark overdue payments as late and return them
    const { data: updated, error: updateErr } = await supabase
      .from('payment_schedules')
      .update({ status: 'late' })
      .eq('status', 'pending')
      .lt('due_date', new Date().toISOString().split('T')[0])
      .select(`
        id, tenant_id, sale_id, amount, due_date, installment_number,
        sales(
          client_id, agent_id,
          clients(full_name, phone),
          units(code),
          users!sales_agent_id_fkey(first_name, last_name, phone)
        )
      `)

    if (updateErr) {
      console.error('Update error:', updateErr)
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!updated || updated.length === 0) {
      return new Response(JSON.stringify({ message: 'No overdue payments', count: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`Marked ${updated.length} overdue payment(s) as late`)

    // 2. Check tenant notification preferences
    const tenantIds = [...new Set(updated.map((p: { tenant_id: string }) => p.tenant_id))]

    const { data: settings } = await supabase
      .from('tenant_settings')
      .select('tenant_id, notif_payment_late')
      .in('tenant_id', tenantIds)

    const notifyTenants = new Set(
      (settings ?? [])
        .filter((s: { notif_payment_late: boolean }) => s.notif_payment_late !== false)
        .map((s: { tenant_id: string }) => s.tenant_id)
    )

    // 3. Get admin emails per tenant for email notifications
    const { data: adminUsers } = await supabase
      .from('users')
      .select('id, email, tenant_id')
      .in('tenant_id', tenantIds)
      .eq('role', 'admin')

    const adminEmailByTenant = new Map<string, string>()
    for (const u of adminUsers ?? []) {
      if (u.email && !adminEmailByTenant.has(u.tenant_id)) {
        adminEmailByTenant.set(u.tenant_id, u.email)
      }
    }

    // 4. Group overdue by tenant and send emails
    const byTenant = new Map<string, Array<{
      client_name: string
      client_phone: string
      unit_code: string
      amount: number
      due_date: string
      installment: number
      client_id: string | null
    }>>()

    let waDispatches = 0
    for (const payment of updated) {
      const sale = payment.sales as {
        client_id: string
        agent_id: string
        clients: { full_name: string; phone: string } | null
        units: { code: string } | null
        users: { first_name: string; last_name: string; phone: string | null } | null
      } | null

      if (!notifyTenants.has(payment.tenant_id)) continue

      if (!byTenant.has(payment.tenant_id)) byTenant.set(payment.tenant_id, [])
      byTenant.get(payment.tenant_id)!.push({
        client_name: sale?.clients?.full_name ?? '-',
        client_phone: sale?.clients?.phone ?? '',
        unit_code: sale?.units?.code ?? '-',
        amount: payment.amount,
        due_date: payment.due_date,
        installment: payment.installment_number,
        client_id: sale?.client_id ?? null,
      })

      // Client-facing WhatsApp dispatch — notify the client directly that
      // the payment is overdue. dispatchAutomation handles the WhatsApp
      // vs task fallback + plan/feature gating.
      if (sale) {
        const dueDate = new Date(payment.due_date)
        const dueDateFr = `${dueDate.getDate()} ${FR_MONTHS[dueDate.getMonth()]} ${dueDate.getFullYear()}`
        const dossierRef = `DOS-${payment.id.slice(0, 8).toUpperCase()}`
        const agent = sale.users
        const agentLine = agent ? `${agent.first_name} ${agent.last_name}${agent.phone ? ' - ' + agent.phone : ''}` : 'Contactez votre agence'

        const result = await dispatchAutomation({
          supabase,
          tenantId: payment.tenant_id,
          clientId: sale.client_id,
          agentId: sale.agent_id,
          templateName: 'paiement_retard',
          templateParams: [
            sale.clients?.full_name ?? '-',
            dueDateFr,
            new Intl.NumberFormat('fr-FR').format(payment.amount),
            dossierRef,
            agentLine,
          ],
          clientPhone: sale.clients?.phone ?? null,
          fallbackTaskTitle: `Relancer impaye ${dossierRef} avec ${sale.clients?.full_name ?? 'client'}`,
          fallbackDueAt: new Date(Date.now() + 4 * 3600 * 1000),
          relatedId: payment.id,
          relatedType: 'payment',
          triggerSource: 'cron_check_payments_paiement_retard',
        })
        if (result.path === 'whatsapp' || result.path === 'task') waDispatches++
      }
    }

    // 5. Send email notifications per tenant
    let emailsSent = 0
    const notifications: Array<{ tenant_id: string; count: number; details: string[] }> = []

    for (const [tenantId, payments] of byTenant) {
      const adminEmail = adminEmailByTenant.get(tenantId)
      const details = payments.map(
        (p) => `${p.client_name} — ${p.unit_code} — Echeance #${p.installment} — ${p.amount} DA — Du le ${p.due_date}`
      )

      notifications.push({ tenant_id: tenantId, count: payments.length, details })

      // Send an email per overdue payment
      if (adminEmail) {
        for (const p of payments) {
          const result = await sendEmailInternal({
            to: adminEmail,
            template: 'payment_overdue',
            template_data: {
              client_name: p.client_name,
              client_phone: p.client_phone,
              unit_code: p.unit_code,
              installment_number: p.installment,
              amount: p.amount,
              due_date: p.due_date,
            },
            tenant_id: tenantId,
            client_id: p.client_id ?? undefined,
          })
          if (result.sent) emailsSent++
        }
      }

      console.log(`[Tenant ${tenantId}] ${payments.length} paiement(s) en retard`)
    }

    const result = {
      message: `Marked ${updated.length} payment(s) as late`,
      updated: updated.length,
      notifications_sent: notifications.length,
      emails_sent: emailsSent,
      whatsapp_dispatches: waDispatches,
      notifications,
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
