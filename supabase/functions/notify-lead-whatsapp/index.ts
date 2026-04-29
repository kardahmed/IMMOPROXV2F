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
// Default points at the production template approved 28-Apr-2026.
// The previous default `new_lead_notification` was re-categorised by
// Meta as Marketing and is no longer usable — keeping it as fallback
// would hard-fail the function if the env var is ever missing.
const TEMPLATE_NAME = Deno.env.get('META_WHATSAPP_TEMPLATE_NAME') ?? 'nouveau_lead__immo_prox'
const TEMPLATE_LANG = Deno.env.get('META_WHATSAPP_TEMPLATE_LANG') ?? 'fr'
const NOTIFY_PHONE = Deno.env.get('NOTIFY_PHONE') ?? '213542766068'
const WEBHOOK_SECRET = Deno.env.get('NOTIFY_LEAD_WEBHOOK_SECRET')

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

// Build the text that goes in the template's {{5}} variable. The copy
// changes depending on whether this is the initial "coordinates captured"
// ping or the later "fully qualified" ping, so the founder can tell at a
// glance which stage the lead is at.
function buildContextLine(lead: Lead, pingKind: 'new' | 'qualified'): string {
  if (pingKind === 'new') {
    return 'Coordonnees captees - qualification en attente'
  }
  if (lead.message && lead.message.trim()) return lead.message.trim()
  const parts: string[] = []
  if (lead.activity_type) parts.push(ACTIVITY_LABELS[lead.activity_type] ?? lead.activity_type)
  if (lead.agents_count) parts.push(`${lead.agents_count} agents`)
  if (lead.timeline) parts.push(TIMELINE_LABELS[lead.timeline] ?? lead.timeline)
  if (lead.frustration_score !== null) parts.push(`frustration ${lead.frustration_score}/10`)
  return parts.length ? parts.join(' - ') : 'Lead qualifie (pas de detail supplementaire)'
}

function buildCompanyLine(lead: Lead): string {
  if (lead.company_name && lead.company_name.trim()) return lead.company_name.trim()
  if (lead.activity_type) return ACTIVITY_LABELS[lead.activity_type] ?? lead.activity_type
  return 'Non renseigne'
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

  // Database Webhook authentication via shared secret. Configure the
  // Supabase Database Webhook to send an "Authorization: Bearer <s>"
  // header (or "X-Webhook-Secret: <s>") matching NOTIFY_LEAD_WEBHOOK_SECRET.
  // Without this gate any anon caller could POST a forged record and
  // make us spam Meta WhatsApp from the founder's number — risking a
  // Meta ban on the WABA.
  if (!WEBHOOK_SECRET) {
    console.error('[notify-lead-whatsapp] NOTIFY_LEAD_WEBHOOK_SECRET not configured — refusing to run')
    return new Response(
      JSON.stringify({ error: 'Webhook not configured' }),
      { status: 503 },
    )
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  const xWebhook = req.headers.get('X-Webhook-Secret') ?? ''
  if (authHeader !== `Bearer ${WEBHOOK_SECRET}` && xWebhook !== WEBHOOK_SECRET) {
    return new Response(
      JSON.stringify({ error: 'Invalid webhook secret' }),
      { status: 401 },
    )
  }

  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.error('Missing META_WHATSAPP_PHONE_NUMBER_ID or META_WHATSAPP_ACCESS_TOKEN secret')
    return new Response(
      JSON.stringify({ error: 'Meta WhatsApp secrets not configured' }),
      { status: 503 },
    )
  }

  let body: { type?: string; record?: Lead; old_record?: Partial<Lead> }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const lead = body.record
  if (!lead?.full_name || !lead.email || !lead.phone) {
    return new Response(
      JSON.stringify({ error: 'Missing required lead fields (full_name, email, phone)' }),
      { status: 400 },
    )
  }

  // Double-ping strategy:
  // - INSERT (step 1 submitted) -> "[NOUVEAU]" ping so the founder can
  //   call back fast even if the lead abandons step 2.
  // - UPDATE where step_completed transitions to 2 -> "[QUALIFIE]" ping
  //   carrying the full qualification details (company, activity, timeline…).
  // All other UPDATEs are ignored so edits never re-notify.
  let pingKind: 'new' | 'qualified'
  if (!body.type || body.type === 'INSERT') {
    pingKind = 'new'
  } else if (body.type === 'UPDATE') {
    const wasQualified = body.old_record?.step_completed === 2
    const isQualified = lead.step_completed === 2
    if (wasQualified || !isQualified) {
      return new Response(JSON.stringify({ skipped: 'update_not_qualification' }), { status: 200 })
    }
    pingKind = 'qualified'
  } else {
    return new Response(JSON.stringify({ skipped: body.type }), { status: 200 })
  }

  const namePrefix = pingKind === 'qualified' ? '[QUALIFIE] ' : '[NOUVEAU] '

  const params = [
    cleanForTemplate(namePrefix + lead.full_name, 60),
    cleanForTemplate(lead.email, 128),
    cleanForTemplate(lead.phone, 32),
    cleanForTemplate(buildCompanyLine(lead), 120),
    cleanForTemplate(buildContextLine(lead, pingKind), 1024),
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
       Nouveau lead recu depuis le site web.

       👤 Nom : {{1}}
       📧 Email : {{2}}
       📱 Telephone : {{3}}
       🏢 Entreprise : {{4}}
       💬 Message : {{5}}

       Recontacte sous 1h pour maximiser la conversion.
   - Samples for review (Meta requires them):
       {{1}} = Youcef Mansouri
       {{2}} = youcef@batiplan.dz
       {{3}} = +213 555 11 22 33
       {{4}} = Batiplan Promotion
       {{5}} = On gere 4 promotions a Oran, Excel sature
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
   - Events:        INSERT and UPDATE (both, for the double-ping strategy)
   - Type:          Supabase Edge Functions
   - Edge Function: notify-lead-whatsapp
   - Method:        POST
   INSERT -> sends the "[NOUVEAU]" ping (step 1 captured).
   UPDATE -> sends the "[QUALIFIE]" ping only when step_completed
             transitions to 2. All other UPDATEs are skipped by the function.

9. End-to-end test
   Submit the form on https://immoprox.io/contact. Two WhatsApp pings
   should arrive at NOTIFY_PHONE within ~10 seconds of each step:
   - "[NOUVEAU] <name>" right after step 1
   - "[QUALIFIE] <name>" right after step 2 (with full qualification data)
*/
