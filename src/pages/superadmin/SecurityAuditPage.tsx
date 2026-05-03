import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldAlert, AlertTriangle, Trash2, RotateCcw, Search, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { DataTable, KPICard, PageHeader, PageSkeleton, StatusBadge } from '@/components/common'
import type { Column } from '@/components/common'
import { Input } from '@/components/ui/input'
import { format, subDays, formatDistanceToNow } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale'

type AuditRow = {
  id: string
  tenant_id: string
  user_id: string | null
  user_role: string | null
  action: 'SOFT_DELETE' | 'HARD_DELETE' | 'REASSIGN' | 'BULK_DELETE' | 'PAYMENT_OVERRIDE' | 'PERMISSION_CHANGE'
  target_type: string
  target_id: string | null
  target_preview: string | null
  metadata: Record<string, unknown>
  created_at: string
  tenant_name?: string
  user_name?: string
}

const ACTION_LABEL: Record<AuditRow['action'], { label: string; color: 'green' | 'blue' | 'orange' | 'red' | 'muted' }> = {
  SOFT_DELETE:       { label: 'Corbeille',     color: 'orange' },
  HARD_DELETE:       { label: 'Suppression',   color: 'red' },
  REASSIGN:          { label: 'Reassignation', color: 'blue' },
  BULK_DELETE:       { label: 'Suppr. masse',  color: 'red' },
  PAYMENT_OVERRIDE:  { label: 'Paiement ecrase', color: 'orange' },
  PERMISSION_CHANGE: { label: 'Permissions',   color: 'blue' },
}

type RangePreset = '7d' | '30d' | '90d' | 'all'

export function SecurityAuditPage() {
  const [range, setRange] = useState<RangePreset>('30d')
  const [actionFilter, setActionFilter] = useState<AuditRow['action'] | 'all'>('all')
  const [search, setSearch] = useState('')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['security-audit', range, actionFilter],
    queryFn: async () => {
      let query = supabase
        .from('security_audit' as never)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (range !== 'all') {
        const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
        query = query.gte('created_at', subDays(new Date(), days).toISOString())
      }
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter)
      }

      const { data, error } = await query
      if (error) { handleSupabaseError(error); throw error }
      const entries = (data ?? []) as unknown as AuditRow[]
      if (entries.length === 0) return entries

      const tenantIds = [...new Set(entries.map(e => e.tenant_id))]
      const userIds = [...new Set(entries.filter(e => e.user_id).map(e => e.user_id!))]

      const [{ data: tenants }, { data: users }] = await Promise.all([
        tenantIds.length > 0 ? supabase.from('tenants').select('id, name').in('id', tenantIds) : Promise.resolve({ data: [] as Array<{id: string; name: string}> }),
        userIds.length > 0 ? supabase.from('users').select('id, first_name, last_name').in('id', userIds) : Promise.resolve({ data: [] as Array<{id: string; first_name: string; last_name: string}> }),
      ])

      const tenantMap = new Map((tenants ?? []).map(t => [t.id, t.name]))
      const userMap = new Map((users ?? []).map(u => [u.id, `${u.first_name} ${u.last_name}`]))

      return entries.map(e => ({
        ...e,
        tenant_name: tenantMap.get(e.tenant_id) ?? '-',
        user_name: e.user_id ? userMap.get(e.user_id) ?? 'Utilisateur supprime' : 'Systeme',
      }))
    },
  })

  // KPIs
  const kpis = useMemo(() => {
    const total = rows.length
    const hardDeletes = rows.filter(r => r.action === 'HARD_DELETE').length
    const softDeletes = rows.filter(r => r.action === 'SOFT_DELETE').length
    // Suspicious: users with >10 destructive actions in the fetched window.
    const perUser = new Map<string, number>()
    for (const r of rows) {
      if (r.action === 'HARD_DELETE' || r.action === 'BULK_DELETE') {
        const key = r.user_id ?? 'system'
        perUser.set(key, (perUser.get(key) ?? 0) + 1)
      }
    }
    const suspiciousUsers = [...perUser.values()].filter(n => n > 10).length
    return { total, hardDeletes, softDeletes, suspiciousUsers }
  }, [rows])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      (r.user_name ?? '').toLowerCase().includes(q)
      || (r.tenant_name ?? '').toLowerCase().includes(q)
      || (r.target_preview ?? '').toLowerCase().includes(q)
      || r.target_type.toLowerCase().includes(q)
    )
  }, [rows, search])

  if (isLoading) return <PageSkeleton kpiCount={4} />

  const columns: Column<AuditRow>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (r) => (
        <div>
          <p className="text-xs font-mono text-immo-text-primary">{format(new Date(r.created_at), 'dd/MM HH:mm')}</p>
          <p className="text-[10px] text-immo-text-muted">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: frLocale })}</p>
        </div>
      ),
    },
    {
      key: 'tenant',
      header: 'Tenant',
      render: (r) => <span className="text-xs text-immo-text-primary">{r.tenant_name}</span>,
    },
    {
      key: 'user',
      header: 'Utilisateur',
      render: (r) => (
        <div>
          <p className="text-xs text-immo-text-primary">{r.user_name}</p>
          {r.user_role && <p className="text-[10px] text-immo-text-muted">{r.user_role}</p>}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (r) => {
        const cfg = ACTION_LABEL[r.action]
        return <StatusBadge label={cfg.label} type={cfg.color} />
      },
    },
    {
      key: 'target',
      header: 'Cible',
      render: (r) => (
        <div>
          <p className="text-xs font-mono text-immo-text-muted">{r.target_type}</p>
          <p className="text-xs text-immo-text-secondary">{r.target_preview ?? r.target_id ?? '-'}</p>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit securite"
        subtitle="Historique des actions destructives sur les donnees tenants (suppressions, reassignations, overrides)."
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard label="Evenements" value={kpis.total} accent="blue" icon={<ShieldAlert className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Suppressions def." value={kpis.hardDeletes} accent={kpis.hardDeletes > 0 ? 'red' : 'green'} icon={<Trash2 className="h-4 w-4 text-immo-status-red" />} />
        <KPICard label="Mises corbeille" value={kpis.softDeletes} accent="orange" icon={<RotateCcw className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label="Utilisateurs suspects" value={kpis.suspiciousUsers} accent={kpis.suspiciousUsers > 0 ? 'red' : 'green'} icon={<AlertTriangle className="h-4 w-4 text-immo-status-red" />} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-immo-text-muted" />
          <Input
            placeholder="Rechercher tenant, utilisateur, cible..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-immo-border-default bg-immo-bg-card p-0.5">
          {(['7d', '30d', '90d', 'all'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                range === r ? 'bg-[#0579DA]/15 text-[#0579DA]' : 'text-immo-text-muted hover:text-immo-text-primary'
              }`}
            >
              {r === 'all' ? 'Tout' : r === '7d' ? '7 jours' : r === '30d' ? '30 jours' : '90 jours'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-immo-border-default bg-immo-bg-card p-0.5">
          {(['all', 'HARD_DELETE', 'SOFT_DELETE'] as const).map(a => (
            <button
              key={a}
              onClick={() => setActionFilter(a)}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                actionFilter === a ? 'bg-[#0579DA]/15 text-[#0579DA]' : 'text-immo-text-muted hover:text-immo-text-primary'
              }`}
            >
              {a === 'all' ? 'Toutes actions' : ACTION_LABEL[a].label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        emptyIcon={<Filter className="h-10 w-10" />}
        emptyMessage="Aucun evenement audit"
        emptyDescription="Les suppressions, reassignations et overrides sensibles apparaitront ici."
      />
    </div>
  )
}
