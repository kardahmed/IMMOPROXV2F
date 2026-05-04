import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Inlined from _shared/cors.ts because the Supabase Dashboard
// deploy flow can't upload _shared files separately. If you move
// to `supabase functions deploy` via CLI, replace with:
//   import { corsHeadersFor } from '../_shared/cors.ts'
const ALLOWED_ORIGINS = new Set<string>([
  'https://app.immoprox.io',
  'http://localhost:5173',
])
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.immoprox.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Verify super_admin
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if ((profile as { role: string } | null)?.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { tenant_id } = await req.json()
    if (!tenant_id) return new Response(JSON.stringify({ error: 'tenant_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Export all data for this tenant
    const tables = ['tenants', 'users', 'projects', 'units', 'clients', 'visits', 'reservations', 'sales', 'payment_schedules', 'history', 'documents', 'charges', 'tasks', 'agent_goals', 'tenant_settings', 'document_templates', 'landing_pages', 'call_scripts']

    const exportData: Record<string, unknown[]> = {}

    for (const table of tables) {
      const filter = table === 'tenants' ? { column: 'id', value: tenant_id } : { column: 'tenant_id', value: tenant_id }
      const { data } = await supabase.from(table).select('*').eq(filter.column, filter.value)
      exportData[table] = data ?? []
    }

    // Build JSON
    const jsonStr = JSON.stringify({ exported_at: new Date().toISOString(), tenant_id, data: exportData }, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })

    // Upload to a PRIVATE bucket with an unguessable name. Audit
    // (HIGH/GDPR) flagged: previous code wrote to the public
    // landing-assets bucket with a Date.now() suffix that could be
    // brute-forced within seconds. Now: dedicated private
    // tenant-exports bucket + UUID name + 15 min signed URL.
    const filename = `${tenant_id}/${crypto.randomUUID()}.json`
    const { error: uploadErr } = await supabase.storage
      .from('tenant-exports')
      .upload(filename, blob, { contentType: 'application/json', upsert: false })
    if (uploadErr) {
      console.error('[export-tenant] upload failed', uploadErr)
      return new Response(JSON.stringify({ error: 'Upload failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from('tenant-exports')
      .createSignedUrl(filename, 900)  // 15 minutes
    if (signErr || !signed?.signedUrl) {
      return new Response(JSON.stringify({ error: 'Signature failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await supabase.from('super_admin_logs').insert({
      super_admin_id: user.id, action: 'export_tenant', tenant_id, details: { tables: Object.keys(exportData).length, rows: Object.values(exportData).reduce((s, d) => s + d.length, 0) },
    } as never)

    return new Response(JSON.stringify({
      url: signed.signedUrl,
      expires_in: 900,
      tables: Object.keys(exportData).length,
      total_rows: Object.values(exportData).reduce((s, d) => s + d.length, 0),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
