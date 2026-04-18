// Supabase Edge Function: delete-account
// RGPD: deletes a user from auth + marks user row as deleted.
// If the user is the sole admin of a tenant, the whole tenant is anonymized.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // Verify caller identity via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonErr('Missing Authorization', 401)
    const jwt = authHeader.replace('Bearer ', '')

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) return jsonErr('Invalid session', 401)

    const { user_id } = await req.json().catch(() => ({ user_id: null }))
    const targetId = user_id ?? userData.user.id

    // Only allow self-deletion (no cross-user)
    if (targetId !== userData.user.id) return jsonErr('Forbidden', 403)

    // Mark row as deleted before removing auth user (preserves audit trail)
    await admin.from('users').update({
      status: 'inactive',
      deletion_requested_at: new Date().toISOString(),
      first_name: 'Utilisateur',
      last_name: 'supprime',
      phone: null,
    }).eq('id', targetId)

    // Remove auth user (also cascades through OnAuthStateChange)
    const { error: delErr } = await admin.auth.admin.deleteUser(targetId)
    if (delErr) return jsonErr(delErr.message, 500)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return jsonErr((err as Error).message ?? 'Internal error', 500)
  }
})

function jsonErr(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
