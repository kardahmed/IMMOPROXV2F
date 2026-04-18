import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, Webhook, Plus, Copy, Trash2, Zap, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { LoadingSpinner, Modal, ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

type Tab = 'keys' | 'webhooks'

export function IntegrationsPage() {
  const [tab, setTab] = useState<Tab>('keys')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-immo-text-primary">Integrations</h1>
        <p className="text-sm text-immo-text-secondary">Cles API et webhooks pour connecter IMMO PRO-X a vos outils.</p>
      </div>

      <div className="flex gap-2 border-b border-immo-border-default">
        {([['keys', 'Cles API', Key], ['webhooks', 'Webhooks', Webhook]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'
            }`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'keys' && <ApiKeysTab />}
      {tab === 'webhooks' && <WebhooksTab />}
    </div>
  )
}

type ApiKey = { id: string; name: string; prefix: string; last_used_at: string | null; created_at: string; revoked_at: string | null }

function ApiKeysTab() {
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [name, setName] = useState('')
  const [toRevoke, setToRevoke] = useState<string | null>(null)

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('api_keys').select('*').eq('tenant_id', tenantId!).order('created_at', { ascending: false })
      return (data ?? []) as ApiKey[]
    },
    enabled: !!tenantId,
  })

  const create = useMutation({
    mutationFn: async () => {
      const full = 'ipx_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const prefix = full.slice(0, 12)
      const hash = await sha256(full)
      await supabase.from('api_keys').insert({ tenant_id: tenantId, name, prefix, key_hash: hash } as never)
      setNewKey(full)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] })
      setName('')
    },
  })

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() } as never).eq('id', id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] })
      toast.success('Cle revoquee')
      setToRevoke(null)
    },
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-60" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setNewKey(null); setShowCreate(true) }} className="bg-immo-accent-green text-immo-bg-primary hover:opacity-90">
          <Plus className="mr-1.5 h-4 w-4" /> Nouvelle cle
        </Button>
      </div>

      {keys.length === 0 ? (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-12 text-center">
          <Key className="mx-auto h-10 w-10 text-immo-text-muted" />
          <p className="mt-3 text-sm text-immo-text-muted">Aucune cle API</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <div key={k.id} className={`flex items-center gap-4 rounded-xl border bg-immo-bg-card p-4 ${k.revoked_at ? 'border-immo-border-default opacity-50' : 'border-immo-border-default'}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-immo-accent-green/10">
                <Key className="h-4 w-4 text-immo-accent-green" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-immo-text-primary">{k.name}</p>
                <p className="text-xs text-immo-text-muted">
                  <code className="font-mono">{k.prefix}...</code>
                  {k.revoked_at && <span className="ml-2 rounded bg-[#CD3D64]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#CD3D64]">REVOQUEE</span>}
                </p>
              </div>
              <div className="text-right text-[11px] text-immo-text-muted">
                {k.last_used_at ? `Utilisee le ${new Date(k.last_used_at).toLocaleDateString('fr-FR')}` : 'Jamais utilisee'}
              </div>
              {!k.revoked_at && (
                <button onClick={() => setToRevoke(k.id)} className="rounded-lg p-2 text-immo-text-muted hover:bg-[#CD3D64]/10 hover:text-[#CD3D64]">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={newKey ? 'Cle creee' : 'Nouvelle cle API'} size="sm">
        {newKey ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 p-3">
              <p className="text-xs text-[#F59E0B]">Copiez cette cle maintenant. Elle ne sera <strong>plus jamais affichee</strong>.</p>
            </div>
            <div className="relative">
              <code className="block break-all rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 pr-20 font-mono text-xs text-immo-text-primary">
                {showToken ? newKey : newKey.slice(0, 12) + '•'.repeat(30)}
              </code>
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                <button onClick={() => setShowToken(!showToken)} className="rounded p-1.5 text-immo-text-muted hover:bg-immo-bg-card-hover">
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Copie') }} className="rounded p-1.5 text-immo-text-muted hover:bg-immo-bg-card-hover">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <Button onClick={() => setShowCreate(false)} className="w-full bg-immo-accent-green text-immo-bg-primary">J'ai copie la cle</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-[11px] text-immo-text-muted">Nom</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Integration Zapier" className="mt-1 border-immo-border-default bg-immo-bg-primary text-immo-text-primary" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-immo-text-secondary">Annuler</Button>
              <Button onClick={() => create.mutate()} disabled={!name || create.isPending} className="bg-immo-accent-green text-immo-bg-primary">
                {create.isPending ? 'Creation...' : 'Creer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!toRevoke} onClose={() => setToRevoke(null)} onConfirm={() => toRevoke && revoke.mutate(toRevoke)}
        title="Revoquer cette cle ?" description="Les integrations utilisant cette cle cesseront de fonctionner immediatement." confirmLabel="Revoquer" />
    </div>
  )
}

type Webhook = { id: string; url: string; events: string[]; active: boolean; created_at: string }

const AVAILABLE_EVENTS = [
  { key: 'client.created', label: 'Nouveau client' },
  { key: 'client.stage_changed', label: 'Changement etape pipeline' },
  { key: 'visit.scheduled', label: 'Visite planifiee' },
  { key: 'reservation.created', label: 'Reservation creee' },
  { key: 'sale.completed', label: 'Vente finalisee' },
  { key: 'payment.received', label: 'Paiement recu' },
]

function WebhooksTab() {
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [toDelete, setToDelete] = useState<string | null>(null)

  const { data: hooks = [], isLoading } = useQuery({
    queryKey: ['webhooks', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('webhooks').select('*').eq('tenant_id', tenantId!).order('created_at', { ascending: false })
      return (data ?? []) as Webhook[]
    },
    enabled: !!tenantId,
  })

  const create = useMutation({
    mutationFn: async () => {
      const secret = 'whsec_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      await supabase.from('webhooks').insert({ tenant_id: tenantId, url, events, secret, active: true } as never)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      toast.success('Webhook ajoute')
      setShowCreate(false); setUrl(''); setEvents([])
    },
  })

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('webhooks').delete().eq('id', id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webhooks'] })
      toast.success('Supprime')
      setToDelete(null)
    },
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-60" />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)} className="bg-immo-accent-green text-immo-bg-primary hover:opacity-90">
          <Plus className="mr-1.5 h-4 w-4" /> Nouveau webhook
        </Button>
      </div>

      {hooks.length === 0 ? (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-12 text-center">
          <Webhook className="mx-auto h-10 w-10 text-immo-text-muted" />
          <p className="mt-3 text-sm text-immo-text-muted">Aucun webhook configure</p>
        </div>
      ) : (
        <div className="space-y-2">
          {hooks.map(h => (
            <div key={h.id} className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#7C3AED]/10">
                  <Zap className="h-4 w-4 text-[#7C3AED]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-mono text-xs text-immo-text-primary">{h.url}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {h.events.map(ev => (
                      <span key={ev} className="rounded-full bg-immo-bg-primary px-2 py-0.5 text-[10px] text-immo-text-secondary">{ev}</span>
                    ))}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${h.active ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'bg-immo-text-muted/10 text-immo-text-muted'}`}>
                  {h.active ? 'ACTIF' : 'INACTIF'}
                </span>
                <button onClick={() => setToDelete(h.id)} className="rounded-lg p-2 text-immo-text-muted hover:bg-[#CD3D64]/10 hover:text-[#CD3D64]">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nouveau webhook" size="md">
        <div className="space-y-4">
          <div>
            <Label className="text-[11px] text-immo-text-muted">URL de destination</Label>
            <Input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://votre-service.com/hook" className="mt-1 border-immo-border-default bg-immo-bg-primary text-immo-text-primary font-mono text-xs" />
          </div>
          <div>
            <Label className="text-[11px] text-immo-text-muted">Evenements ({events.length})</Label>
            <div className="mt-2 space-y-1.5">
              {AVAILABLE_EVENTS.map(ev => (
                <label key={ev.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 hover:border-immo-accent-green">
                  <input type="checkbox" checked={events.includes(ev.key)}
                    onChange={() => setEvents(prev => prev.includes(ev.key) ? prev.filter(e => e !== ev.key) : [...prev, ev.key])}
                    className="h-4 w-4 rounded border-immo-border-default" />
                  <span className="flex-1 text-sm text-immo-text-primary">{ev.label}</span>
                  <code className="text-[10px] text-immo-text-muted">{ev.key}</code>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-immo-text-secondary">Annuler</Button>
            <Button onClick={() => create.mutate()} disabled={!url || events.length === 0 || create.isPending} className="bg-immo-accent-green text-immo-bg-primary">
              {create.isPending ? 'Creation...' : 'Creer'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!toDelete} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete)}
        title="Supprimer ce webhook ?" description="Cette action est irreversible." confirmLabel="Supprimer" />
    </div>
  )
}

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
