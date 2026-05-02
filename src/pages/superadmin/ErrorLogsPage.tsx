import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Card, PageHeader, PageSkeleton } from '@/components/common'
import { Button } from '@/components/ui/button'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'

interface ErrorLog {
  id: string
  tenant_id: string | null
  user_id: string | null
  message: string
  stack: string | null
  component_stack: string | null
  url: string | null
  user_agent: string | null
  created_at: string
  tenant_name?: string
}

export function ErrorLogsPage() {
  const [selected, setSelected] = useState<ErrorLog | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['error-logs'],
    queryFn: async () => {
      // error_logs is not yet in database.generated.ts — cast through never
      // until the user regenerates types via `supabase gen types`.
      const { data, error } = await (supabase.from('error_logs' as never) as unknown as {
        select: (s: string) => { order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> } }
      })
        .select('id, tenant_id, user_id, message, stack, component_stack, url, user_agent, created_at, tenants(name)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) { handleSupabaseError(error as never); throw error }
      return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
        ...r,
        tenant_name: (r.tenants as { name: string } | null)?.name ?? null,
      })) as unknown as ErrorLog[]
    },
  })

  async function handlePurge() {
    if (!confirm('Purger les logs > 90 jours ? Cette action est irréversible.')) return
    const { error } = await supabase.rpc('purge_old_error_logs' as never)
    if (error) {
      handleSupabaseError(error)
      return
    }
    toast.success('Logs anciens purgés')
    refetch()
  }

  if (isLoading) return <PageSkeleton kpiCount={3} hasTable />

  const logs = data ?? []
  const total = logs.length
  const last24h = logs.filter(l => Date.now() - new Date(l.created_at).getTime() < 86400000).length
  const uniqueMessages = new Set(logs.map(l => l.message.slice(0, 100))).size

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs d'erreurs"
        subtitle="Crashes React capturés par l'ErrorBoundary côté tenant"
        actions={
          <>
            <Button onClick={() => refetch()} disabled={isFetching} className="border border-immo-border-default bg-transparent text-immo-text-secondary hover:bg-immo-bg-card-hover">
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Rafraîchir
            </Button>
            <Button onClick={handlePurge} className="border border-immo-status-red/30 bg-immo-status-red/10 text-immo-status-red hover:bg-immo-status-red/20">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {'Purger > 90j'}
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-xs text-immo-text-muted">Total (200 récents)</p>
          <p className="text-2xl font-bold text-immo-text-primary">{total}</p>
        </Card>
        <Card>
          <p className="text-xs text-immo-text-muted">Dernières 24h</p>
          <p className={`text-2xl font-bold ${last24h > 10 ? 'text-immo-status-red' : 'text-immo-text-primary'}`}>{last24h}</p>
        </Card>
        <Card>
          <p className="text-xs text-immo-text-muted">Messages uniques</p>
          <p className="text-2xl font-bold text-immo-text-primary">{uniqueMessages}</p>
        </Card>
      </div>

      {/* List */}
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-immo-border-default bg-immo-bg-card py-12 text-center">
          <AlertTriangle className="mb-3 h-8 w-8 text-immo-text-muted" />
          <p className="text-sm font-medium text-immo-text-primary">Aucune erreur enregistrée</p>
          <p className="mt-1 text-xs text-immo-text-muted">Les crashes côté front apparaîtront ici si l'ErrorBoundary les capture.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-immo-border-default">
          <table className="w-full">
            <thead>
              <tr className="bg-immo-bg-card-hover">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">Quand</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">Tenant</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">Message</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">URL</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-immo-border-default">
              {logs.map(l => (
                <tr key={l.id} className="bg-immo-bg-card hover:bg-immo-bg-card-hover">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-muted">
                    {formatDistanceToNow(new Date(l.created_at), { addSuffix: true, locale: fr })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-secondary">
                    {l.tenant_name ?? <span className="text-immo-text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="line-clamp-1 max-w-[400px] text-xs font-mono text-immo-status-red">{l.message}</p>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-immo-text-muted">
                    {l.url ? <span className="font-mono">{new URL(l.url).pathname}</span> : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      onClick={() => setSelected(l)}
                      className="text-xs text-immo-accent-blue hover:underline"
                    >
                      Détails
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-[720px] overflow-y-auto rounded-xl border border-immo-border-default bg-immo-bg-card p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-immo-text-primary">Détail du crash</h3>
              <button onClick={() => setSelected(null)} className="text-xs text-immo-text-muted hover:text-immo-text-primary">Fermer</button>
            </div>
            <div className="space-y-3 text-xs">
              <Field label="Message"><pre className="whitespace-pre-wrap font-mono text-[11px] text-immo-status-red">{selected.message}</pre></Field>
              <Field label="Quand">{format(new Date(selected.created_at), 'dd/MM/yyyy HH:mm:ss')}</Field>
              {selected.tenant_name && <Field label="Tenant">{selected.tenant_name}</Field>}
              {selected.url && (
                <Field label="URL">
                  <a href={selected.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-immo-accent-blue hover:underline">
                    {selected.url} <ExternalLink className="h-3 w-3" />
                  </a>
                </Field>
              )}
              {selected.user_agent && <Field label="User Agent"><span className="break-all text-[11px] text-immo-text-muted">{selected.user_agent}</span></Field>}
              {selected.stack && (
                <Field label="Stack">
                  <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-md bg-immo-bg-primary p-3 font-mono text-[10px] text-immo-text-secondary">{selected.stack}</pre>
                </Field>
              )}
              {selected.component_stack && (
                <Field label="Component stack">
                  <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-md bg-immo-bg-primary p-3 font-mono text-[10px] text-immo-text-secondary">{selected.component_stack}</pre>
                </Field>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">{label}</p>
      <div className="text-immo-text-primary">{children}</div>
    </div>
  )
}
