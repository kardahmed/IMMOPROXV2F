// Notifies the founder via WhatsApp (CallMeBot) every time a new lead
// lands in marketing_leads. Wired as a Supabase Database Webhook on
// INSERT — see README at the bottom of this file for the hPanel/Studio
// config steps.

const CALLMEBOT_API_KEY = Deno.env.get('CALLMEBOT_API_KEY')
const NOTIFY_PHONE = Deno.env.get('NOTIFY_PHONE') ?? '213542766068'

const TIMELINE_LABELS: Record<string, string> = {
  this_week: 'Cette semaine',
  this_month: 'Ce mois',
  '3_months': '3 mois',
  browsing: 'En reflexion',
}

const ACTIVITY_LABELS: Record<string, string> = {
  agence: 'Agence immo',
  promoteur: 'Promoteur',
  freelance: 'Freelance',
  entreprise: 'Entreprise',
}

type Lead = {
  id: string
  full_name: string
  email: string
  phone: string
  company_name: string | null
  activity_type: string | null
  agents_count: string | null
  leads_per_month: string | null
  marketing_budget_monthly: string | null
  current_tools: string | null
  decision_maker: string | null
  frustration_score: number | null
  timeline: string | null
  message: string | null
  source: string | null
  step_completed: number
  created_at: string
}

function formatMessage(lead: Lead): string {
  const lines: string[] = []
  const isFull = lead.step_completed === 2

  lines.push(isFull ? '🔥 Nouveau lead QUALIFIE' : '👋 Nouveau lead (etape 1)')
  lines.push('')
  lines.push(`👤 ${lead.full_name}`)
  lines.push(`📧 ${lead.email}`)
  lines.push(`📱 ${lead.phone}`)

  if (isFull) {
    lines.push('')
    if (lead.company_name) lines.push(`🏢 ${lead.company_name}`)
    if (lead.activity_type) lines.push(`💼 ${ACTIVITY_LABELS[lead.activity_type] ?? lead.activity_type}`)
    if (lead.agents_count) lines.push(`👥 ${lead.agents_count} agents`)
    if (lead.leads_per_month) lines.push(`📊 ${lead.leads_per_month} leads/mois`)
    if (lead.marketing_budget_monthly) lines.push(`💰 Budget marketing: ${lead.marketing_budget_monthly}`)
    if (lead.current_tools) lines.push(`🛠 Outil actuel: ${lead.current_tools}`)
    if (lead.timeline) lines.push(`⏱ Timeline: ${TIMELINE_LABELS[lead.timeline] ?? lead.timeline}`)
    if (lead.frustration_score) lines.push(`😤 Frustration: ${lead.frustration_score}/10`)
    if (lead.decision_maker) lines.push(`🎯 Decideur: ${lead.decision_maker}`)
    if (lead.message) {
      lines.push('')
      lines.push(`📝 ${lead.message}`)
    }
  }

  if (lead.source) {
    lines.push('')
    lines.push(`📍 Source: ${lead.source}`)
  }

  return lines.join('\n')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 })
  }

  if (!CALLMEBOT_API_KEY) {
    console.error('CALLMEBOT_API_KEY secret missing')
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 503 })
  }

  let body: { type?: string; record?: Lead }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  // Supabase Database Webhook payload shape: { type: 'INSERT'|'UPDATE'|..., record: {...}, old_record? }
  // Skip non-INSERT events (e.g. step-1 -> step-2 patch).
  if (body.type && body.type !== 'INSERT') {
    return new Response(JSON.stringify({ skipped: body.type }), { status: 200 })
  }

  const lead = body.record
  if (!lead?.full_name || !lead.email) {
    return new Response(JSON.stringify({ error: 'Missing required lead fields' }), { status: 400 })
  }

  const text = formatMessage(lead)
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(NOTIFY_PHONE)}&text=${encodeURIComponent(text)}&apikey=${CALLMEBOT_API_KEY}`

  const upstream = await fetch(url)
  const upstreamText = await upstream.text()

  if (!upstream.ok) {
    console.error('CallMeBot error:', upstream.status, upstreamText)
    return new Response(JSON.stringify({ error: 'CallMeBot upstream error', status: upstream.status, body: upstreamText }), { status: 502 })
  }

  return new Response(JSON.stringify({ sent: true, lead_id: lead.id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

/*
SETUP — one-time per environment

1. Get a CallMeBot API key (free, ~3 min):
   - Add +34 644 51 95 23 to your phone contacts as "CallMeBot"
   - Send "I allow callmebot to send me messages" via WhatsApp
   - Wait for the bot to reply with your apikey (number)

2. Set Supabase secrets (Dashboard > Project Settings > Edge Functions > Secrets):
   - CALLMEBOT_API_KEY = <the key from step 1>
   - NOTIFY_PHONE = 213542766068  (without + sign)

3. Deploy this function:
   - supabase functions deploy notify-lead-whatsapp
   OR upload via Supabase Dashboard > Edge Functions > New Function

4. Wire the Database Webhook (Dashboard > Database > Webhooks > Create):
   - Name:           notify-lead-whatsapp
   - Table:          marketing_leads
   - Events:         INSERT only
   - Type:           Supabase Edge Functions
   - Edge Function:  notify-lead-whatsapp
   - Method:         POST
   - HTTP headers:   (default, includes Authorization)

5. Test:
   - Submit the contact form on https://immoprox.io/contact
   - You should receive a WhatsApp message within 5-10 seconds
*/
