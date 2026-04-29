// Receives WhatsApp Cloud API events from Meta:
//   - GET  /webhook  → verification handshake (one-time per app)
//   - POST /webhook  → inbound messages + delivery status updates
//
// MVP closure plan step A. The first half of the task↔reality loop:
// without this, replies from clients never land in our DB, so we can't
// auto-close tasks, can't power the inbox UI, and can't feed the
// engagement score.
//
// Resolution flow per inbound message:
//   1. Meta hits us with payload.entry[].changes[].value.metadata.phone_number_id
//   2. We look up whatsapp_accounts WHERE phone_number_id = ? → tenant_id
//   3. Match value.messages[].from (E.164 phone) → clients.phone within
//      that tenant. Inherit the client's agent_id when found.
//   4. Insert in whatsapp_messages with direction='inbound', body_text
//      derived from the message type, raw_payload preserved for debug.
//
// Status updates (delivery receipts):
//   - Find the existing row by wa_message_id within tenant_id
//   - UPDATE its status (sent → delivered → read, or failed)
//
// Setup (Meta side + Supabase side) at the bottom of this file.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VERIFY_TOKEN = Deno.env.get('META_WHATSAPP_WEBHOOK_VERIFY_TOKEN') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Meta App Secret — used to verify the X-Hub-Signature-256 HMAC on
// every POST. Without this gate the webhook accepts any anonymous
// request and an attacker can forge inbound messages, auto-close
// arbitrary tasks, or inflate engagement scores across all tenants.
const META_APP_SECRET = Deno.env.get('META_APP_SECRET')

// Verify Meta's HMAC-SHA256 signature header against the raw POST body.
// Must use a constant-time comparison to defeat timing attacks.
async function verifyMetaSignature(
  signatureHeader: string | null,
  rawBody: string,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false
  }
  const expectedHex = signatureHeader.slice('sha256='.length)

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const computed = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time string compare.
  if (computed.length !== expectedHex.length) return false
  let diff = 0
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHex.charCodeAt(i)
  }
  return diff === 0
}

type MetaMessage = {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { caption?: string; id: string; mime_type?: string }
  document?: { caption?: string; id: string; filename?: string; mime_type?: string }
  audio?: { id: string; mime_type?: string }
  video?: { caption?: string; id: string; mime_type?: string }
  sticker?: { id: string; mime_type?: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string }> }>
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
  reaction?: { emoji: string; message_id: string }
}

type MetaStatus = {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  errors?: Array<{ code: number; title: string; message?: string }>
}

type MetaWebhookPayload = {
  object?: string
  entry?: Array<{
    id: string
    changes?: Array<{
      field: string
      value: {
        messaging_product?: string
        metadata?: { display_phone_number?: string; phone_number_id?: string }
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>
        messages?: MetaMessage[]
        statuses?: MetaStatus[]
      }
    }>
  }>
}

// Convert a Meta message into a human-readable preview for the inbox.
// The full structured payload is preserved separately in raw_payload.
function buildBodyPreview(msg: MetaMessage): string {
  switch (msg.type) {
    case 'text':
      return msg.text?.body ?? ''
    case 'image':
      return msg.image?.caption ?? '[image]'
    case 'document':
      return msg.document?.caption ?? `[document: ${msg.document?.filename ?? 'fichier'}]`
    case 'audio':
      return '[audio]'
    case 'video':
      return msg.video?.caption ?? '[video]'
    case 'sticker':
      return '[sticker]'
    case 'location':
      return `[location: ${msg.location?.name ?? `${msg.location?.latitude},${msg.location?.longitude}`}]`
    case 'contacts':
      return `[contact: ${msg.contacts?.[0]?.name?.formatted_name ?? 'inconnu'}]`
    case 'interactive':
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '[interactive]'
    case 'reaction':
      return `[reaction: ${msg.reaction?.emoji ?? '?'}]`
    default:
      return `[${msg.type}]`
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // ── GET → Meta verification handshake ────────────────────────────
  // Meta calls this once when you save the webhook URL in the app
  // configuration. It sends `hub.mode=subscribe`, `hub.verify_token`
  // (the shared secret we configured), and `hub.challenge` (a random
  // string Meta wants echoed back). Reply with the challenge if the
  // token matches; reject otherwise.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (!VERIFY_TOKEN) {
      console.error('[whatsapp-webhook] META_WHATSAPP_WEBHOOK_VERIFY_TOKEN not set')
      return new Response('Server misconfigured', { status: 500 })
    }

    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      console.log('[whatsapp-webhook] verification handshake OK')
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    console.warn('[whatsapp-webhook] verification handshake rejected', { mode, tokenMatch: token === VERIFY_TOKEN })
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // ── POST → process incoming events ───────────────────────────────
  // Read the raw body once: we need the exact bytes for HMAC
  // verification, then JSON-parse the same string. Calling req.json()
  // first would consume the body and we couldn't re-read it.
  const rawBody = await req.text()

  // Signature verification. Fail closed if the secret isn't configured
  // — running unverified would let an attacker inject inbound messages
  // and auto-close tasks across every tenant.
  if (!META_APP_SECRET) {
    console.error('[whatsapp-webhook] META_APP_SECRET not configured — refusing to process events')
    return new Response('Webhook not configured', { status: 503 })
  }
  const sigValid = await verifyMetaSignature(
    req.headers.get('X-Hub-Signature-256'),
    rawBody,
    META_APP_SECRET,
  )
  if (!sigValid) {
    console.warn('[whatsapp-webhook] X-Hub-Signature-256 verification failed')
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  // Always 200 to Meta, even on partial failures — otherwise Meta
  // will retry the same event aggressively and we'll get duplicates
  // when the partial failure is just one bad message in a batch.
  // Errors are logged server-side instead.
  const result = { processedMessages: 0, processedStatuses: 0, errors: [] as string[] }

  if (payload.object !== 'whatsapp_business_account') {
    console.warn('[whatsapp-webhook] unexpected object type:', payload.object)
    return new Response(JSON.stringify({ ...result, skipped: 'wrong_object_type' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const value = change.value
      const phoneNumberId = value.metadata?.phone_number_id

      if (!phoneNumberId) {
        result.errors.push('Missing metadata.phone_number_id')
        continue
      }

      // Resolve tenant by the receiving phone_number_id.
      const { data: account, error: accountErr } = await supabase
        .from('whatsapp_accounts')
        .select('tenant_id')
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle()

      if (accountErr) {
        result.errors.push(`whatsapp_accounts lookup failed: ${accountErr.message}`)
        continue
      }
      if (!account) {
        result.errors.push(`No tenant connected for phone_number_id=${phoneNumberId}`)
        continue
      }

      const tenantId = (account as { tenant_id: string }).tenant_id

      // ── Inbound messages ─────────────────────────────────────────
      for (const msg of value.messages ?? []) {
        // Phone matching: Meta delivers E.164 WITHOUT the '+' prefix
        // (e.g., '213542766068'), but clients.phone can be stored
        // either way ('+213542766068' or '213542766068' or with
        // spaces/dashes from manual entry). Try both common forms;
        // give up gracefully if neither matches.
        const phoneCandidates = [msg.from, `+${msg.from}`]
        const { data: client } = await supabase
          .from('clients')
          .select('id, agent_id')
          .eq('tenant_id', tenantId)
          .in('phone', phoneCandidates)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle()

        const insertPayload = {
          tenant_id: tenantId,
          client_id: (client as { id: string } | null)?.id ?? null,
          agent_id: (client as { agent_id: string | null } | null)?.agent_id ?? null,
          direction: 'inbound',
          from_phone: msg.from,
          to_phone: value.metadata?.display_phone_number ?? null,
          body_text: buildBodyPreview(msg),
          message_type: msg.type,
          wa_message_id: msg.id,
          status: 'received',
          raw_payload: msg,
          template_name: null,
        }

        // Idempotent insert. Migration 046 added a UNIQUE partial
        // index on wa_message_id, so on Meta retry we ignore the
        // duplicate instead of writing twice (which would make the
        // auto-close fire repeatedly).
        const { data: insertedRows, error: insertErr } = await supabase
          .from('whatsapp_messages')
          .upsert(insertPayload as never, {
            onConflict: 'wa_message_id',
            ignoreDuplicates: true,
          })
          .select('id')

        if (insertErr) {
          result.errors.push(`Insert message ${msg.id}: ${insertErr.message}`)
          continue
        }

        // ignoreDuplicates returns an empty array on conflict — skip
        // the auto-close path so a Meta retry can't close the task
        // a second time.
        const isDuplicate = !insertedRows || insertedRows.length === 0
        if (isDuplicate) {
          continue
        }
        result.processedMessages++

        // ── Auto-close pending tasks (step C — task↔reality loop) ──
        // When a client we know replies, mark the latest pending task
        // for them as done — only if the task was actually executed
        // (executed_at IS NOT NULL) and not auto-cancelled. This is
        // the second half of the loop: agents send via /inbox or the
        // task's "Send via CRM" button (which sets executed_at), and
        // when the client replies, the system closes the task without
        // a manual click.
        const matchedClientId = (client as { id: string } | null)?.id
        if (matchedClientId) {
          // Restrict auto-close to whatsapp tasks. Without this filter
          // a client's WhatsApp reply would also close pending call /
          // email tasks for the same client — those are different
          // touchpoints and need their own follow-up flow.
          const { data: pendingTask } = await supabase
            .from('tasks')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('client_id', matchedClientId)
            .eq('status', 'pending')
            .eq('channel', 'whatsapp')
            .not('executed_at', 'is', null)
            .neq('auto_cancelled', true)
            .is('deleted_at', null)
            .order('executed_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const taskId = (pendingTask as { id: string } | null)?.id
          if (taskId) {
            const nowIso = new Date().toISOString()
            const { error: closeErr } = await supabase
              .from('tasks')
              .update({
                status: 'done',
                completed_at: nowIso,
                client_response: msg.type === 'text' ? (msg.text?.body ?? null) : null,
              } as never)
              .eq('id', taskId)

            if (closeErr) {
              result.errors.push(`Auto-close task ${taskId}: ${closeErr.message}`)
            } else {
              await supabase.from('history').insert({
                tenant_id: tenantId,
                client_id: matchedClientId,
                agent_id: (client as { agent_id: string | null } | null)?.agent_id ?? null,
                type: 'whatsapp_message',
                title: 'Tache auto-fermee : reponse client recue',
                metadata: { task_id: taskId, wa_message_id: msg.id, message_type: msg.type },
              } as never)
            }
          }
        }
      }

      // ── Delivery status updates ──────────────────────────────────
      for (const status of value.statuses ?? []) {
        const { error: updateErr } = await supabase
          .from('whatsapp_messages')
          .update({
            status: status.status,
            error_message: status.errors?.[0]?.message ?? null,
          } as never)
          .eq('wa_message_id', status.id)
          .eq('tenant_id', tenantId)

        if (updateErr) {
          result.errors.push(`Update status ${status.id}: ${updateErr.message}`)
        } else {
          result.processedStatuses++
        }
      }
    }
  }

  console.log(
    `[whatsapp-webhook] processed ${result.processedMessages} message(s) + ${result.processedStatuses} status(es), ${result.errors.length} error(s)`,
  )
  if (result.errors.length > 0) {
    console.error('[whatsapp-webhook] errors:', result.errors)
  }

  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

/*
SETUP — one-time per environment

Prerequisite: the founder's Meta WhatsApp Cloud API setup is already
working (notify-lead-whatsapp uses the same app). This function just
adds an INBOUND path for the same WABA.

1. Generate a long random verify token
   Any 40+ char random string. Example:
     openssl rand -hex 32
   Save it — you'll paste it both in Supabase secrets AND in Meta's
   webhook config screen. The values must match exactly or the
   handshake fails.

2. Set the Supabase Edge Function secret
   Dashboard → Project Settings → Edge Functions → Secrets:
   - META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = <the token from step 1>
   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-populated by
   Supabase — no need to set those manually.)

3. Deploy the function
   supabase functions deploy whatsapp-webhook
   OR upload via Supabase Dashboard → Edge Functions

4. Configure the Meta webhook
   developers.facebook.com → Your App → WhatsApp → Configuration →
   Webhooks
   - Callback URL:
       https://lbnqccsebwiifxcucflg.supabase.co/functions/v1/whatsapp-webhook
   - Verify token: <the token from step 1>
   - Click "Verify and save"
     Meta makes a GET to your URL with hub.mode=subscribe + hub.verify_token
     + hub.challenge. The function echoes the challenge back if the token
     matches → green checkmark in Meta UI.
   - Subscribe to fields: messages, message_template_status_update
     (the messages field gives both inbound messages and delivery statuses)

5. End-to-end test (founder's own number)
   Send a WhatsApp message FROM your personal phone TO the WABA number
   (the one configured in notify-lead-whatsapp). Within 1-2 seconds:
   - The function is invoked (visible in Supabase Edge Function logs)
   - A row appears in whatsapp_messages with direction='inbound',
     from_phone=<your personal number>, body_text=<your message>
   Quick check via SQL:
     SELECT direction, from_phone, body_text, created_at
       FROM whatsapp_messages
      ORDER BY created_at DESC
      LIMIT 5;

6. End-to-end test (status updates)
   Send a WhatsApp message FROM the WABA number (via notify-lead-whatsapp,
   or the test "Send message" button in Meta API Setup). The webhook will
   receive 'sent' → 'delivered' → 'read' status events. Confirm:
     SELECT wa_message_id, status, updated_at
       FROM whatsapp_messages
      WHERE direction='outbound'
      ORDER BY created_at DESC
      LIMIT 5;
   Status should advance from 'sent' to 'delivered' (within seconds) to
   'read' (when the recipient opens the message).

7. Tenant onboarding (later — depends on Embedded Signup, MVP step H)
   For each tenant that connects their own WABA via the upcoming
   /settings/whatsapp Embedded Signup flow, their phone_number_id will
   land in whatsapp_accounts.phone_number_id automatically. The webhook
   then resolves tenant_id from there with no extra config — every
   tenant's inbound messages route to their own /messages inbox via
   the migration 017 RLS policies (admin sees all, agent sees own
   clients).

DEBUGGING

- Webhook handshake fails: check that VERIFY_TOKEN matches between
  Supabase secret and Meta config. Whitespace / trailing newline are
  common culprits.
- "No tenant connected for phone_number_id=...": that phone_number_id
  is not in any whatsapp_accounts row. For the founder test, manually
  insert one:
    INSERT INTO whatsapp_accounts (tenant_id, phone_number_id, waba_id,
                                   display_phone, is_active)
    VALUES ('<your tenant uuid>', '<phone_number_id>', '<waba_id>',
            '+213…', true);
- Messages arrive but client_id is NULL: the from_phone doesn't match
  any clients.phone. Either the client doesn't exist yet, or the phone
  format differs (Meta sends E.164 without '+'; check your clients.phone
  storage convention).
- Same wa_message_id inserted twice: Meta retries on 5xx or timeout.
  The function returns 200 on partial failure to avoid this; if you
  still see duplicates, add a UNIQUE constraint on wa_message_id and
  switch to ON CONFLICT DO NOTHING in the insert.
*/
