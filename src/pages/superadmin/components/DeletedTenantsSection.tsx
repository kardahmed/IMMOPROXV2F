import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, RotateCcw, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/common'
import toast from 'react-hot-toast'

interface DeletedTenantRow {
  id: string
  name: string
  email: string | null
  plan: string
  deleted_at: string
  deletion_reason: string | null
  deleted_by: string | null
  deleted_by_name?: string | null
}

export function DeletedTenantsSection() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const { data: deleted = [], isLoading } = useQuery({
    queryKey: ['super-admin-tenants-deleted'],
    queryFn: async (): Promise<DeletedTenantRow[]> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, email, plan, deleted_at, deletion_reason, deleted_by')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as unknown as DeletedTenantRow[]

      // Resolve deleted_by display names (best-effort)
      const ids = Array.from(new Set(rows.map(r => r.deleted_by).filter(Boolean) as string[]))
      if (ids.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name')
          .in('id', ids)
        const nameMap = new Map(
          ((users ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>)
            .map(u => [u.id, [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || null]),
        )
        for (const r of rows) {
          if (r.deleted_by) r.deleted_by_name = nameMap.get(r.deleted_by) ?? null
        }
      }
      return rows
    },
  })

  const restoreMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      const { error } = await supabase.rpc('restore_tenant' as never, { p_tenant_id: tenantId } as never)
      if (error) throw error
    },
    onSuccess: (_data, tenantId) => {
      const t = deleted.find(d => d.id === tenantId)
      toast.success(`Tenant « ${t?.name ?? '?'} » restauré`)
      qc.invalidateQueries({ queryKey: ['super-admin-tenants'] })
      qc.invalidateQueries({ queryKey: ['super-admin-tenants-deleted'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Echec de la restauration')
    },
  })

  if (isLoading) return null
  if (deleted.length === 0 && !expanded) return null

  return (
    <Card noPadding className="overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between border-b border-immo-border-default bg-immo-bg-card-hover/40 px-5 py-3 text-start transition-colors hover:bg-immo-bg-card-hover"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-4 w-4 text-immo-text-muted" /> : <ChevronRight className="h-4 w-4 text-immo-text-muted" />}
          <Trash2 className="h-4 w-4 text-immo-text-muted" />
          <span className="text-sm font-semibold text-immo-text-primary">Tenants supprimés</span>
          <span className="rounded-full bg-immo-bg-primary px-2 py-0.5 text-[10px] font-semibold text-immo-text-muted">
            {deleted.length}
          </span>
        </div>
        <span className="text-[11px] text-immo-text-muted">
          {expanded ? 'Masquer' : 'Afficher'}
        </span>
      </button>

      {expanded && (
        <>
          {deleted.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-immo-text-muted">
              Aucun tenant supprimé.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-immo-border-default/50 bg-immo-bg-primary text-[10px] uppercase tracking-wide text-immo-text-muted">
                  <th className="px-4 py-2 text-start font-semibold">Nom</th>
                  <th className="px-4 py-2 text-start font-semibold">Plan</th>
                  <th className="px-4 py-2 text-start font-semibold">Supprimé le</th>
                  <th className="px-4 py-2 text-start font-semibold">Par</th>
                  <th className="px-4 py-2 text-start font-semibold">Raison</th>
                  <th className="px-4 py-2 text-end font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-immo-border-default/30">
                {deleted.map(t => {
                  const isPending = restoreMutation.isPending && restoreMutation.variables === t.id
                  return (
                    <tr key={t.id} className="hover:bg-immo-bg-primary/30">
                      <td className="px-4 py-2 font-medium text-immo-text-primary">
                        {t.name}
                        {t.email && <span className="ms-2 text-[10px] text-immo-text-muted">{t.email}</span>}
                      </td>
                      <td className="px-4 py-2 text-xs uppercase text-immo-text-secondary">{t.plan}</td>
                      <td className="px-4 py-2 text-xs text-immo-text-secondary">
                        {format(new Date(t.deleted_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                      </td>
                      <td className="px-4 py-2 text-xs text-immo-text-secondary">
                        {t.deleted_by_name ?? (t.deleted_by ? '—' : 'système')}
                      </td>
                      <td className="px-4 py-2 text-xs italic text-immo-text-muted">
                        {t.deletion_reason ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-end">
                        <button
                          onClick={() => restoreMutation.mutate(t.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded-md border border-immo-accent-green/40 bg-immo-accent-green/10 px-2.5 py-1 text-[11px] font-medium text-immo-accent-green transition-colors hover:bg-immo-accent-green/20 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Restaurer ce tenant"
                        >
                          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                          Restaurer
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </Card>
  )
}
