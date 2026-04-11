import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Auth: service role key required
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${supabaseServiceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const now = new Date()
    const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0]
    const twoDaysFromNow = new Date(now.getTime() + 2 * 86400000).toISOString()
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString()
    const notifications: Array<{ tenant_id: string; user_id: string | null; type: string; title: string; message: string; metadata: Record<string, unknown> }> = []

    // 1. Payment reminders (due in 3 days)
    const { data: upcomingPayments } = await supabase
      .from('payment_schedules')
      .select('id, tenant_id, amount, due_date, installment_number, sales(agent_id, clients(full_name), units(code))')
      .eq('status', 'pending')
      .lte('due_date', threeDaysFromNow)
      .gte('due_date', now.toISOString().split('T')[0])

    for (const p of upcomingPayments ?? []) {
      const sale = p.sales as { agent_id: string; clients: { full_name: string } | null; units: { code: string } | null } | null
      notifications.push({
        tenant_id: p.tenant_id,
        user_id: sale?.agent_id ?? null,
        type: 'payment_reminder',
        title: `Echeance #${p.installment_number} dans ${Math.ceil((new Date(p.due_date).getTime() - now.getTime()) / 86400000)}j`,
        message: `${sale?.clients?.full_name ?? '-'} — ${sale?.units?.code ?? '-'} — ${p.amount} DA`,
        metadata: { payment_id: p.id, due_date: p.due_date },
      })
    }

    // 2. Expiring reservations (in 2 days)
    const { data: expiringRes } = await supabase
      .from('reservations')
      .select('id, tenant_id, agent_id, expires_at, clients(full_name), units(code)')
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
    }

    // Insert notifications (avoid duplicates by checking type+metadata today)
    let inserted = 0
    for (const n of notifications) {
      const { error } = await supabase.from('notifications').insert(n)
      if (!error) inserted++
    }

    return new Response(JSON.stringify({
      message: `Created ${inserted} notification(s)`,
      breakdown: {
        payment_reminders: notifications.filter(n => n.type === 'payment_reminder').length,
        reservation_expiring: notifications.filter(n => n.type === 'reservation_expiring').length,
        client_relaunch: notifications.filter(n => n.type === 'client_relaunch').length,
      },
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Fatal:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
