import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Save, Lock, CheckCircle2, XCircle, Loader2, FlaskConical } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, PageHeader, PageSkeleton } from '@/components/common'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

interface Integration {
  key: string
  value: string | null
  label: string
  category: 'analytics' | 'ads' | 'communication' | 'crm' | 'monitoring'
  description: string | null
  doc_url: string | null
  is_secret: boolean
  enabled: boolean
  sort_order: number
  has_value: boolean
  updated_at: string
  updated_by: string | null
}

type Category = Integration['category']

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const ADMIN_ENDPOINT = `${SUPABASE_URL}/functions/v1/admin-config`

const CATEGORIES: readonly { id: Category; label: string; icon: string }[] = [
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'ads', label: 'Publicité (Ads)', icon: '💰' },
  { id: 'communication', label: 'Communication', icon: '💬' },
  { id: 'crm', label: 'CRM', icon: '🤝' },
  { id: 'monitoring', label: 'Monitoring', icon: '🛡️' },
]

const MASK_REGEX = /^•+[A-Za-z0-9]{0,8}$/

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Session expirée — reconnectez-vous')
  return {
    Authorization: `Bearer ${data.session.access_token}`,
    'Content-Type': 'application/json',
  }
}

async function fetchIntegrations(): Promise<Integration[]> {
  const headers = await authHeaders()
  const res = await fetch(ADMIN_ENDPOINT, { headers })
  if (res.status === 401) throw new Error('Non authentifié')
  if (res.status === 403) throw new Error('Accès refusé — droits admin requis')
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const json = await res.json()
  return json.items as Integration[]
}

async function patchIntegration(payload: { key: string; value?: string | null; enabled?: boolean }): Promise<Integration> {
  const headers = await authHeaders()
  const res = await fetch(ADMIN_ENDPOINT, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `Erreur ${res.status}`)
  }
  return res.json()
}

async function testIntegration(key: string): Promise<{ ok: boolean; message: string }> {
  const headers = await authHeaders()
  const res = await fetch(`${ADMIN_ENDPOINT}/test`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ key }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `Erreur ${res.status}`)
  }
  return res.json()
}

export function IntegrationsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('analytics')

  const { data: integrations, isLoading, error } = useQuery({
    queryKey: ['admin-integrations'],
    queryFn: fetchIntegrations,
  })

  const grouped = useMemo(() => {
    const map = new Map<Category, Integration[]>()
    for (const c of CATEGORIES) map.set(c.id, [])
    if (integrations) {
      for (const item of integrations) {
        const arr = map.get(item.category)
        if (arr) arr.push(item)
      }
      for (const arr of map.values()) {
        arr.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
      }
    }
    return map
  }, [integrations])

  if (isLoading) return <PageSkeleton kpiCount={0} />

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Intégrations marketing" subtitle="Pixels, API et clés des outils utilisés par immoprox.io" />
        <Card className="p-8 text-center">
          <XCircle className="mx-auto mb-2 h-8 w-8 text-immo-status-red" />
          <p className="text-sm font-medium text-immo-text-primary">{(error as Error).message}</p>
        </Card>
      </div>
    )
  }

  const items = grouped.get(activeCategory) ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intégrations marketing"
        subtitle="Pixels, API et clés consommés par le site immoprox.io. Les secrets sont chiffrés côté serveur."
      />

      {/* Tabs */}
      <div className="-mx-1 overflow-x-auto">
        <div className="flex min-w-max gap-1 px-1">
          {CATEGORIES.map(cat => {
            const list = grouped.get(cat.id) ?? []
            const active = list.filter(i => i.enabled).length
            const total = list.length
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#0579DA]/15 text-[#0579DA]'
                    : 'text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  isActive ? 'bg-[#0579DA]/20 text-[#0579DA]' : 'bg-immo-bg-primary text-immo-text-muted'
                }`}>
                  {active}/{total}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Cards grid */}
      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-immo-text-secondary">Aucune intégration dans cette catégorie</p>
        </Card>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
          {items.map(item => (
            <IntegrationCard key={item.key} integration={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<string>(integration.value ?? '')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const initialValue = integration.value ?? ''
  const dirty = draft !== initialValue
  const isMasked = integration.is_secret && integration.has_value && MASK_REGEX.test(draft)

  const save = useMutation({
    mutationFn: async () => {
      if (isMasked) throw new Error('Collez la nouvelle valeur pour la modifier')
      const trimmed = draft.trim()
      return patchIntegration({ key: integration.key, value: trimmed === '' ? null : trimmed })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-integrations'] })
      setTestResult(null)
      toast.success(`${integration.label} enregistré`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const toggle = useMutation({
    mutationFn: async () => patchIntegration({ key: integration.key, enabled: !integration.enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-integrations'] })
      toast.success(integration.enabled ? `${integration.label} désactivé` : `${integration.label} activé`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const test = useMutation({
    mutationFn: () => testIntegration(integration.key),
    onSuccess: r => setTestResult(r),
    onError: (err: Error) => setTestResult({ ok: false, message: err.message }),
  })

  const status = (() => {
    if (integration.enabled) return { label: 'Activé', tone: 'green' as const }
    if (integration.has_value) return { label: 'Configuré · inactif', tone: 'gray' as const }
    return { label: 'Non configuré', tone: 'muted' as const }
  })()

  const toneClass =
    status.tone === 'green'
      ? 'bg-immo-accent-green/15 text-immo-accent-green'
      : status.tone === 'gray'
      ? 'bg-immo-bg-primary text-immo-text-secondary'
      : 'bg-immo-bg-primary text-immo-text-muted'

  return (
    <Card className="flex flex-col gap-3 p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-immo-text-primary">{integration.label}</h3>
            {integration.is_secret && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#0579DA]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#0579DA]">
                <Lock className="h-2.5 w-2.5" /> Secret
              </span>
            )}
          </div>
          {integration.description && (
            <p className="mt-1 text-xs text-immo-text-secondary">{integration.description}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}>
          {status.label}
        </span>
      </div>

      {/* Input */}
      <div>
        <Label className="text-[11px] font-medium text-immo-text-secondary">
          Valeur · <span className="font-mono text-immo-text-muted">{integration.key}</span>
        </Label>
        <Input
          variant="immo"
          type={integration.is_secret ? 'password' : 'text'}
          value={draft}
          onChange={e => { setDraft(e.target.value); setTestResult(null) }}
          placeholder={integration.is_secret ? 'Coller le secret…' : 'Coller la valeur…'}
          className="mt-1 font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs ${
          testResult.ok
            ? 'bg-immo-accent-green/10 text-immo-accent-green'
            : 'bg-immo-status-red/10 text-immo-status-red'
        }`}>
          {testResult.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending || isMasked}
          variant="blue"
          size="sm"
          title={isMasked ? 'Collez la nouvelle valeur pour la modifier' : undefined}
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Enregistrer
        </Button>

        <Button
          onClick={() => test.mutate()}
          disabled={!integration.has_value || test.isPending || dirty}
          variant="blue-outline"
          size="sm"
          title={dirty ? 'Enregistrez avant de tester' : undefined}
        >
          {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
          Tester
        </Button>

        <button
          onClick={() => toggle.mutate()}
          disabled={!integration.has_value || toggle.isPending}
          role="switch"
          aria-checked={integration.enabled}
          aria-label={integration.enabled ? `Désactiver ${integration.label}` : `Activer ${integration.label}`}
          title={!integration.has_value ? 'Renseignez une valeur avant d\'activer' : undefined}
          className={`ml-auto flex h-6 w-11 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0579DA]/40 disabled:cursor-not-allowed disabled:opacity-50 ${
            integration.enabled ? 'bg-immo-accent-green' : 'bg-immo-border-default'
          }`}
        >
          <div className={`h-5 w-5 rounded-full bg-white transition-transform ${integration.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Footer */}
      {integration.doc_url && (
        <a
          href={integration.doc_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-immo-text-muted hover:text-[#0579DA] hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Documentation
        </a>
      )}
    </Card>
  )
}
