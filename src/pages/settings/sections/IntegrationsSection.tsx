import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Mail, CheckCircle2, AlertCircle, Loader2, Plug, ExternalLink, RefreshCw, Trash2, Save, Target } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/common'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// What we render about the resend integration. Mirrors the columns the
// authenticated role is allowed to SELECT from tenant_integrations
// (api_key is REVOKEd at the column level, so it never reaches here —
// the user can only set or delete it, not read it back).
interface ResendIntegration {
  id: string
  type: 'resend'
  enabled: boolean
  config: { from_email?: string; from_name?: string; reply_to?: string } | null
  verified_at: string | null
  last_test_at: string | null
  last_test_error: string | null
  updated_at: string
}

interface PixelIntegration {
  id: string
  type: 'meta_pixel'
  enabled: boolean
  config: { pixel_id?: string; test_event_code?: string } | null
  updated_at: string
}

export function IntegrationsSection() {
  const tenantId = useAuthStore(s => s.tenantId)
  const userId = useAuthStore(s => s.session?.user?.id)
  const role = useAuthStore(s => s.role)
  const qc = useQueryClient()

  const isAdmin = role === 'admin' || role === 'super_admin'

  const { data: resend, isLoading } = useQuery({
    queryKey: ['tenant-integration-resend', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_integrations' as never)
        .select('id, type, enabled, config, verified_at, last_test_at, last_test_error, updated_at')
        .eq('tenant_id', tenantId!)
        .eq('type', 'resend')
        .maybeSingle()
      return data as ResendIntegration | null
    },
    enabled: !!tenantId,
  })

  const { data: metaPixel } = useQuery({
    queryKey: ['tenant-integration-meta-pixel', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tenant_integrations' as never)
        .select('id, type, enabled, config, updated_at')
        .eq('tenant_id', tenantId!)
        .eq('type', 'meta_pixel')
        .maybeSingle()
      return data as PixelIntegration | null
    },
    enabled: !!tenantId,
  })

  if (!isAdmin) {
    return (
      <Card>
        <div className="p-6 text-center text-sm text-immo-text-muted">
          Seul un administrateur du tenant peut configurer les intégrations.
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-immo-text-primary">Intégrations</h2>
        <p className="text-sm text-immo-text-muted mt-0.5">
          Connectez vos propres comptes pour que les emails partent depuis votre domaine, sur votre quota.
        </p>
      </div>

      {isLoading
        ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-immo-text-muted" /></div>
        : <>
            <ResendCard integration={resend ?? null} tenantId={tenantId!} userId={userId ?? null} onChange={() => qc.invalidateQueries({ queryKey: ['tenant-integration-resend'] })} />
            <MetaPixelCard integration={metaPixel ?? null} tenantId={tenantId!} userId={userId ?? null} onChange={() => qc.invalidateQueries({ queryKey: ['tenant-integration-meta-pixel'] })} />
          </>
      }
    </div>
  )
}

function ResendCard({ integration, tenantId, userId, onChange }: {
  integration: ResendIntegration | null
  tenantId: string
  userId: string | null
  onChange: () => void
}) {
  const [editing, setEditing] = useState(integration === null)
  const [apiKey, setApiKey] = useState('')
  const [fromEmail, setFromEmail] = useState(integration?.config?.from_email ?? '')
  const [fromName, setFromName] = useState(integration?.config?.from_name ?? '')

  const save = useMutation({
    mutationFn: async () => {
      if (!apiKey.trim() && !integration) throw new Error('La clé API Resend est requise')
      if (!fromEmail.trim()) throw new Error("L'email d'envoi est requis (ex: contact@votreagence.dz)")
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) throw new Error("Email d'envoi invalide")

      const config = {
        from_email: fromEmail.trim().toLowerCase(),
        from_name: fromName.trim() || null,
      }

      if (integration) {
        // Update — only set api_key if user actually typed a new one
        const update: Record<string, unknown> = { config, enabled: integration.enabled }
        if (apiKey.trim()) update.api_key = apiKey.trim()
        const { error } = await supabase
          .from('tenant_integrations' as never)
          .update(update as never)
          .eq('id', integration.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('tenant_integrations' as never)
          .insert({
            tenant_id: tenantId,
            type: 'resend',
            api_key: apiKey.trim(),
            config,
            enabled: false,
            created_by: userId,
          } as never)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Configuration enregistrée — testez l\'envoi pour activer')
      setApiKey('')
      setEditing(false)
      onChange()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleEnabled = useMutation({
    mutationFn: async (next: boolean) => {
      if (!integration) return
      // Refuse to enable if the configuration was never tested successfully —
      // otherwise the agency clicks "send" later and we silently bounce
      // every email through a key that doesn't work.
      if (next && !integration.verified_at) {
        throw new Error("Lancez d'abord un test d'envoi avec succès avant d'activer")
      }
      const { error } = await supabase
        .from('tenant_integrations' as never)
        .update({ enabled: next } as never)
        .eq('id', integration.id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Mis à jour'); onChange() },
    onError: (err: Error) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: async () => {
      if (!integration) return
      if (!window.confirm('Supprimer cette configuration ? Les emails repasseront sur la clé globale IMMO PRO-X.')) {
        throw new Error('Annulé')
      }
      const { error } = await supabase
        .from('tenant_integrations' as never)
        .delete()
        .eq('id', integration.id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Configuration supprimée'); onChange() },
    onError: (err: Error) => { if (err.message !== 'Annulé') toast.error(err.message) },
  })

  const test = useMutation({
    mutationFn: async () => {
      if (!integration) throw new Error('Configurez d\'abord la clé')
      // Send a test email to the configured from_email (the founder of
      // the tenant typically owns that mailbox). We pass tenant_id so
      // send-email picks up the tenant's Resend; if it errors out we
      // surface that to the user.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expirée')
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: 'test',
          to: integration.config?.from_email,
          subject: 'IMMO PRO-X — test de votre intégration Resend',
          body: '<p>Si vous lisez cet email, votre intégration Resend fonctionne. Vous pouvez maintenant l\'activer dans IMMO PRO-X → Paramètres → Intégrations.</p>',
          tenant_id: tenantId,
          metadata: { test: true },
        }),
      })
      const json = await res.json().catch(() => ({}))
      const ok = res.ok
      const errorMsg = ok ? null : (json?.error ?? `HTTP ${res.status}`)

      // Persist the test result so the UI shows a verified badge or the
      // last error without re-running it.
      await supabase
        .from('tenant_integrations' as never)
        .update({
          last_test_at: new Date().toISOString(),
          last_test_error: errorMsg,
          verified_at: ok ? new Date().toISOString() : integration.verified_at,
        } as never)
        .eq('id', integration.id)

      if (!ok) throw new Error(errorMsg ?? 'Échec du test')
    },
    onSuccess: () => { toast.success('Email de test envoyé — vérifiez votre boîte'); onChange() },
    onError: (err: Error) => { toast.error(err.message); onChange() },
  })

  // Status pill
  const status = !integration
    ? { label: 'Non configuré', cls: 'bg-immo-text-muted/10 text-immo-text-muted' }
    : integration.last_test_error
      ? { label: 'Échec test', cls: 'bg-immo-status-red/10 text-immo-status-red' }
      : !integration.verified_at
        ? { label: 'À tester', cls: 'bg-immo-status-orange/10 text-immo-status-orange' }
        : !integration.enabled
          ? { label: 'Vérifié, désactivé', cls: 'bg-immo-accent-blue/10 text-immo-accent-blue' }
          : { label: 'Actif', cls: 'bg-immo-accent-green/10 text-immo-accent-green' }

  return (
    <Card>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-immo-accent-blue/10 text-immo-accent-blue">
            <Mail className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-immo-text-primary">Resend (Email)</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
            </div>
            <p className="mt-0.5 text-sm text-immo-text-muted">
              Envoyez vos emails marketing et automatiques depuis votre propre domaine.
              <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-1 text-immo-accent-blue hover:underline">
                Documentation Resend <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>

        {/* Setup steps (always visible — short reminder) */}
        <div className="mt-4 rounded-lg border border-immo-border-default/60 bg-immo-bg-primary p-3">
          <p className="text-xs font-semibold text-immo-text-secondary mb-2">Mise en route :</p>
          <ol className="space-y-1 text-xs text-immo-text-muted">
            <li>1. Créez un compte sur <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-immo-accent-blue hover:underline">resend.com</a> (gratuit jusqu'à 3 000 emails/mois).</li>
            <li>2. Ajoutez votre domaine + collez les enregistrements DNS chez votre registrar (Resend valide en ~30 min).</li>
            <li>3. Créez une clé API et collez-la ici, avec votre email d'envoi (ex: <code>contact@votreagence.dz</code>).</li>
            <li>4. Cliquez "Tester l'envoi" pour vérifier puis activez.</li>
          </ol>
        </div>

        {editing ? (
          <div className="mt-4 space-y-3">
            <Field label={integration ? 'Nouvelle clé API Resend (laisser vide pour conserver)' : 'Clé API Resend *'}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="re_••••••••••••••••"
                autoComplete="off"
                className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm font-mono text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Email d'envoi *">
                <input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="contact@votreagence.dz"
                  className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
                />
              </Field>
              <Field label="Nom d'expéditeur (optionnel)">
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Agence Alger Centre"
                  className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {integration && (
                <Button variant="ghost" onClick={() => { setEditing(false); setApiKey(''); setFromEmail(integration.config?.from_email ?? ''); setFromName(integration.config?.from_name ?? '') }} className="text-immo-text-secondary">
                  Annuler
                </Button>
              )}
              <Button onClick={() => save.mutate()} disabled={save.isPending} variant="blue">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" /> Enregistrer</>}
              </Button>
            </div>
          </div>
        ) : integration ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-immo-border-default/60 bg-immo-bg-primary p-3">
              <Info label="Email d'envoi" value={integration.config?.from_email ?? '—'} />
              <Info label="Nom d'expéditeur" value={integration.config?.from_name ?? '—'} />
              <Info label="Clé API" value="re_••••••••••••" />
              <Info label="Dernière modif" value={format(new Date(integration.updated_at), 'dd/MM/yyyy HH:mm')} />
              {integration.last_test_at && (
                <Info
                  label="Dernier test"
                  value={`${format(new Date(integration.last_test_at), 'dd/MM/yyyy HH:mm')}${integration.last_test_error ? ' — échec' : ' — OK'}`}
                  warn={!!integration.last_test_error}
                />
              )}
            </div>

            {integration.last_test_error && (
              <div className="flex items-start gap-2 rounded-lg border border-immo-status-red/30 bg-immo-status-red/5 p-3 text-xs text-immo-status-red">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Le dernier test a échoué :</p>
                  <p className="font-mono break-all">{integration.last_test_error}</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending} className="text-immo-status-red hover:bg-immo-status-red/10">
                <Trash2 className="mr-1.5 h-4 w-4" /> Supprimer
              </Button>
              <Button variant="ghost" onClick={() => test.mutate()} disabled={test.isPending} className="text-immo-text-secondary">
                {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="mr-1.5 h-4 w-4" /> Tester l'envoi</>}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(true)} className="text-immo-accent-blue hover:bg-immo-accent-blue/10">
                Modifier
              </Button>
              <Button
                onClick={() => toggleEnabled.mutate(!integration.enabled)}
                disabled={toggleEnabled.isPending}
                variant={integration.enabled ? 'ghost' : 'blue'}
                className={integration.enabled ? 'border border-immo-status-orange/30 text-immo-status-orange hover:bg-immo-status-orange/10' : ''}
              >
                {integration.enabled
                  ? 'Désactiver'
                  : <><CheckCircle2 className="mr-1.5 h-4 w-4" /> Activer</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-immo-border-default p-4">
            <div className="flex items-center gap-3 text-sm text-immo-text-muted">
              <Plug className="h-4 w-4" />
              Aucune configuration Resend — vos emails passent par la clé globale IMMO PRO-X.
            </div>
            <Button onClick={() => setEditing(true)} variant="blue">
              Configurer
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

function MetaPixelCard({ integration, tenantId, userId, onChange }: {
  integration: PixelIntegration | null
  tenantId: string
  userId: string | null
  onChange: () => void
}) {
  const [editing, setEditing] = useState(integration === null)
  const [pixelId, setPixelId] = useState(integration?.config?.pixel_id ?? '')
  const [testEventCode, setTestEventCode] = useState(integration?.config?.test_event_code ?? '')

  const save = useMutation({
    mutationFn: async () => {
      if (!pixelId.trim()) throw new Error('Le Pixel ID est requis')
      if (!/^[0-9]{10,20}$/.test(pixelId.trim())) throw new Error('Pixel ID invalide (15-16 chiffres en général)')

      const config = {
        pixel_id: pixelId.trim(),
        test_event_code: testEventCode.trim() || null,
      }

      if (integration) {
        const { error } = await supabase
          .from('tenant_integrations' as never)
          .update({ config, enabled: integration.enabled } as never)
          .eq('id', integration.id)
        if (error) throw error
      } else {
        // Pixel ID is the only thing needed for client-side tracking;
        // there's nothing to "test" without a server, so we enable it
        // straight away. Founder can always toggle it off.
        const { error } = await supabase
          .from('tenant_integrations' as never)
          .insert({
            tenant_id: tenantId,
            type: 'meta_pixel',
            config,
            enabled: true,
            created_by: userId,
          } as never)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Pixel Meta enregistré — il sera injecté sur toutes vos landing pages')
      setEditing(false)
      onChange()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggleEnabled = useMutation({
    mutationFn: async (next: boolean) => {
      if (!integration) return
      const { error } = await supabase
        .from('tenant_integrations' as never)
        .update({ enabled: next } as never)
        .eq('id', integration.id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Mis à jour'); onChange() },
    onError: (err: Error) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: async () => {
      if (!integration) return
      if (!window.confirm('Supprimer le Pixel Meta de toutes vos landing pages ?')) {
        throw new Error('Annulé')
      }
      const { error } = await supabase
        .from('tenant_integrations' as never)
        .delete()
        .eq('id', integration.id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Pixel supprimé'); onChange() },
    onError: (err: Error) => { if (err.message !== 'Annulé') toast.error(err.message) },
  })

  const status = !integration
    ? { label: 'Non configuré', cls: 'bg-immo-text-muted/10 text-immo-text-muted' }
    : !integration.enabled
      ? { label: 'Désactivé', cls: 'bg-immo-status-orange/10 text-immo-status-orange' }
      : { label: 'Actif', cls: 'bg-immo-accent-green/10 text-immo-accent-green' }

  return (
    <Card>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1877F2]/10 text-[#1877F2]">
            <Target className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-immo-text-primary">Meta Pixel</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}>{status.label}</span>
            </div>
            <p className="mt-0.5 text-sm text-immo-text-muted">
              Suivi des conversions Facebook / Instagram pour vos landing pages.
              <a href="https://www.facebook.com/business/help/952192354843755" target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-1 text-immo-accent-blue hover:underline">
                Trouver mon Pixel ID <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-immo-border-default/60 bg-immo-bg-primary p-3">
          <p className="text-xs font-semibold text-immo-text-secondary mb-2">Comment ça marche :</p>
          <ul className="space-y-1 text-xs text-immo-text-muted">
            <li>• Le Pixel ID est injecté <strong>par défaut</strong> sur toutes vos landing pages.</li>
            <li>• Si une landing a son propre Pixel (champ <code>meta_pixel_id</code> dans son éditeur), elle l'utilise à la place.</li>
            <li>• Le test event code (optionnel) sert à voir vos events dans Meta → Events Manager → Test Events.</li>
          </ul>
        </div>

        {editing ? (
          <div className="mt-4 space-y-3">
            <Field label="Pixel ID *">
              <input
                type="text"
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="ex: 1234567890123456"
                inputMode="numeric"
                className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm font-mono text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
              />
            </Field>
            <Field label="Test Event Code (optionnel)">
              <input
                type="text"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                placeholder="ex: TEST12345"
                className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-sm font-mono text-immo-text-primary focus:border-immo-accent-blue focus:outline-none"
              />
            </Field>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {integration && (
                <Button variant="ghost" onClick={() => { setEditing(false); setPixelId(integration.config?.pixel_id ?? ''); setTestEventCode(integration.config?.test_event_code ?? '') }} className="text-immo-text-secondary">
                  Annuler
                </Button>
              )}
              <Button onClick={() => save.mutate()} disabled={save.isPending} variant="blue">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" /> Enregistrer</>}
              </Button>
            </div>
          </div>
        ) : integration ? (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-immo-border-default/60 bg-immo-bg-primary p-3">
              <Info label="Pixel ID" value={integration.config?.pixel_id ?? '—'} />
              <Info label="Test Event Code" value={integration.config?.test_event_code || '—'} />
              <Info label="Dernière modif" value={format(new Date(integration.updated_at), 'dd/MM/yyyy HH:mm')} />
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending} className="text-immo-status-red hover:bg-immo-status-red/10">
                <Trash2 className="mr-1.5 h-4 w-4" /> Supprimer
              </Button>
              <Button variant="ghost" onClick={() => setEditing(true)} className="text-immo-accent-blue hover:bg-immo-accent-blue/10">
                Modifier
              </Button>
              <Button
                onClick={() => toggleEnabled.mutate(!integration.enabled)}
                disabled={toggleEnabled.isPending}
                variant={integration.enabled ? 'ghost' : 'blue'}
                className={integration.enabled ? 'border border-immo-status-orange/30 text-immo-status-orange hover:bg-immo-status-orange/10' : ''}
              >
                {integration.enabled ? 'Désactiver' : <><CheckCircle2 className="mr-1.5 h-4 w-4" /> Activer</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-immo-border-default p-4">
            <div className="flex items-center gap-3 text-sm text-immo-text-muted">
              <Plug className="h-4 w-4" />
              Aucun Pixel Meta — vos landing pages n'envoient rien à Facebook Ads.
            </div>
            <Button onClick={() => setEditing(true)} variant="blue">
              Configurer
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-immo-text-secondary">{label}</span>
      {children}
    </label>
  )
}

function Info({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-immo-text-muted">{label}</div>
      <div className={`mt-0.5 text-sm ${warn ? 'text-immo-status-red' : 'text-immo-text-primary'}`}>{value}</div>
    </div>
  )
}
