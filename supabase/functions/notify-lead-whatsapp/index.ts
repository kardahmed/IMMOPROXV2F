// Pings the founder via WhatsApp every time a new lead lands in
// marketing_leads. Triggered by a Supabase Database Webhook on INSERT.
//
// Upstream: Meta WhatsApp Cloud API (replaces the initial CallMeBot
// prototype, which was abandoned when the bot never returned an API
// key). Meta is officially supported, more reliable, and unlocks
// richer templates + delivery receipts.
//
// See the SETUP block at the bottom of this file for the one-time
// configuration steps (Meta app, template approval, Supabase secrets,
// webhook wiring).

const PHONE_NUMBER_ID = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')
const ACCESS_TOKEN = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN')
const TEMPLATE_NAME = Deno.env.get('META_WHATSAPP_TEMPLATE_NAME') ?? 'new_lead_notification'
const TEMPLATE_LANG = Deno.env.get('META_WHATSAPP_TEMPLATE_LANG') ?? 'fr'
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

// Build the text that goes in the template's {{4}} variable — either the
// lead's own message, or a compact qualification summary if they finished
// step 2 without leaving a free-text note, or a short "step-1 only" hint.
function buildContextLine(lead: Lead): string {
  if (lead.step_completed === 2) {
    if (lead.message && lead.message.trim()) return lead.message.trim()
    const parts: string[] = []
    if (lead.company_name) parts.push(lead.company_name)
    if (lead.activity_type) parts.push(ACTIVITY_LABELS[lead.activity_type] ?? lead.activity_type)
    if (lead.agents_count) parts.push(`${lead.agents_count} agents`)
    if (lead.timeline) parts.push(TIMELINE_LABELS[lead.timeline] ?? lead.timeline)
    if (lead.frustration_score !== null) parts.push(`frustration ${lead.frustration_score}/10`)
    return parts.length ? parts.join(' - ') : 'Lead qualifie (pas de detail)'
  }
  return 'Lead non qualifie (abandon etape 2)'
}

// Meta templates reject newlines, most emojis, and repeated whitespace in
// body variables. Normalize to a single line of plain ASCII-safe-ish text
// that still reads well in French.
function cleanForTemplate(value: string, maxLen = 1024): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 })
  }

  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.error('Missing META_WHATSAPP_PHONE_NUMBER_ID or META_WHATSAPP_ACCESS_TOKEN secret')
    return new Response(
      JSON.stringify({ error: 'Meta WhatsApp secrets not configured' }),
      { status: 503 },
    )
  }

  let body: { type?: string; record?: Lead }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  // Supabase Database Webhook payload: { type: 'INSERT'|'UPDATE'|..., record, old_record? }
  // Skip non-INSERT events so the step-1 -> step-2 patch doesn't double-notify.
  if (body.type && body.type !== 'INSERT') {
    return new Response(JSON.stringify({ skipped: body.type }), { status: 200 })
  }

  const lead = body.record
  if (!lead?.full_name || !lead.email || !lead.phone) {
    return new Response(
      JSON.stringify({ error: 'Missing required lead fields (full_name, email, phone)' }),
      { status: 400 },
    )
  }

  const params = [
    cleanForTemplate(lead.full_name, 60),
    cleanForTemplate(lead.email, 128),
    cleanForTemplate(lead.phone, 32),
    cleanForTemplate(buildContextLine(lead), 1024),
  ]

  const url = `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: NOTIFY_PHONE,
      type: 'template',
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANG },
        components: [{
          type: 'body',
          parameters: params.map(text => ({ type: 'text', text })),
        }],
      },
    }),
  })

  const result = await upstream.json().catch(() => ({}))

  if (!upstream.ok) {
    console.error('Meta Cloud API error:', upstream.status, result)
    return new Response(
      JSON.stringify({
        error: 'Meta upstream error',
        status: upstream.status,
        details: result,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({
      sent: true,
      lead_id: lead.id,
      message_id: result.messages?.[0]?.id ?? null,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})

/*
SETUP — one-time per environment

Prerequisite: Meta Business Manager with a verified business (LLC).

1. Create a Meta app
   https://developers.facebook.com -> My Apps -> Create App
   - Use case: Other
   - App type: Business
   - Link to your Business portfolio (verified LLC)

2. Add the WhatsApp product
   Dashboard -> Add products -> WhatsApp -> Set up
   Meta provisions:
   - A test phone number (free, 1000 conversations/month, test-mode recipients only)
   - A temporary access token (24h)
   - A default template "hello_world"

3. Add your personal WhatsApp as a recipient
   WhatsApp -> API Setup -> To -> Manage phone number list -> Add
   Enter +213542766068, confirm via WhatsApp code.

4. Create the production template
   https://business.facebook.com/wa/manage/message-templates/
   - Name:     new_lead_notification
   - Category: Utility
   - Language: French (fr)
   - Body:
       🔥 Nouveau lead IMMO PRO-X

       👤 {{1}}
       📧 {{2}}
       📱 {{3}}

       📝 {{4}}
   - Samples for review (Meta requires them):
       {{1}} = Youcef Mansouri
       {{2}} = youcef@batiplan.dz
       {{3}} = +213 555 11 22 33
       {{4}} = On gere 4 promotions a Oran, Excel sature
   Submit for review. Approval typically takes 1-24h for Utility.

5. Get a permanent access token (before the 24h temp one expires)
   https://business.facebook.com/settings/system-users -> Add
   - Role: Admin
   - Assign your Meta app with Full control
   - Generate new token
     - App: your app
     - Expiration: Never
     - Permissions: whatsapp_business_messaging, whatsapp_business_management

6. Set Supabase Edge Function secrets
   Dashboard -> Project Settings -> Edge Functions -> Secrets
   - META_WHATSAPP_PHONE_NUMBER_ID  (from WhatsApp -> API Setup)
   - META_WHATSAPP_ACCESS_TOKEN     (the permanent one from step 5)
   - META_WHATSAPP_TEMPLATE_NAME    (default: new_lead_notification)
   - META_WHATSAPP_TEMPLATE_LANG    (optional, default: fr)
   - NOTIFY_PHONE                   (default: 213542766068, no + sign)

7. Deploy this function
   supabase functions deploy notify-lead-whatsapp
   OR upload via Supabase Dashboard -> Edge Functions

8. Wire the Database Webhook
   Dashboard -> Database -> Webhooks -> Create
   - Name:          notify-lead-whatsapp
   - Table:         marketing_leads
   - Events:        INSERT only
   - Type:          Supabase Edge Functions
   - Edge Function: notify-lead-whatsapp
   - Method:        POST

9. End-to-end test
   Submit the form on https://immoprox.io/contact. A WhatsApp ping
   should arrive at NOTIFY_PHONE within ~10 seconds.
*/
