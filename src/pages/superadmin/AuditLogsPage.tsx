import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Search, Download, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { DataTable, PageHeader, PageSkeleton, StatusBadge } from '@/components/common'
import type { Column } from '@/components/common'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'

interface LogEntry {
  id: string
  super_admin_id: string
  action: string
  tenant_id: string | null
  details: Record<string, unknown>
  created_at: string
  admin_name?: string
  tenant_name?: string
}

const ACTION_LABELS: Record<string, { label: string; color: 'green' | 'blue' | 'orange' | 'red' | 'muted' }> = {
  create_tenant: { label: 'Creation tenant', color: 'green' },
  create_user: { label: 'Creation utilisateur', color: 'green' },
  update_role: { label: 'Changement role', color: 'blue' },
  toggle_status: { label: 'Changement statut', color: 'orange' },
  reset_password: { label: 'Reset mot de passe', color: 'blue' },
  delete_user: { label: 'Suppression utilisateur', color: 'red' },
  delete_tenant: { label: 'Suppression tenant', color: 'red' },
  restore_tenant: { label: 'Restauration tenant', color: 'green' },
  enter_tenant: { label: 'Acces tenant', color: 'muted' },
  update_settings: { label: 'Modification parametres', color: 'blue' },
  update_plan: { label: 'Modification plan / quota', color: 'orange' },
}

const PAGE_SIZE = 50

export function AuditLogsPage() {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['super-admin-logs', actionFilter, limit],
    queryFn: async () => {
      let query = supabase
        .from('super_admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter)
      }

      const { data, error } = await query
      if (error) { handleSupabaseError(error); throw error }

      // Enrich with admin names and tenant names
      const entries = data as LogEntry[]
      if (entries.length === 0) return entries

      // Fetch admin names
      const adminIds = [...new Set(entries.map(e => e.super_admin_id))]
      const { data: admins } = await supabase.from('users').select('id, first_name, last_name').in('id', adminIds)
      const adminMap = new Map((admins ?? []).map(a => [a.id, `${a.first_name} ${a.last_name}`]))

      // Fetch tenant names
      const tenantIds = [...new Set(entries.filter(e => e.tenant_id).map(e => e.tenant_id!))]
      const { data: tenants } = tenantIds.length > 0
        ? await supabase.from('tenants').select('id, name').in('id', tenantIds)
        : { data: [] }
      const tenantMap = new Map((tenants ?? []).map(t => [t.id, t.name]))

      return entries.map(e => ({
        ...e,
        admin_name: adminMap.get(e.super_admin_id) ?? '-',
        tenant_name: e.tenant_id ? tenantMap.get(e.tenant_id) ?? '-' : '-',
      }))
    },
  })

  // Filter by search
  const filtered = logs.filter(l => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      l.action.toLowerCase().includes(s) ||
      l.admin_name?.toLowerCase().includes(s) ||
      l.tenant_name?.toLowerCase().includes(s) ||
      JSON.stringify(l.details).toLowerCase().includes(s)
    )
  })

  // Export CSV
  function exportCSV() {
    const headers = ['Date', 'Heure', 'Admin', 'Action', 'Tenant', 'Details']
    const rows = filtered.map(l => [
      format(new Date(l.created_at), 'dd/MM/yyyy'),
      format(new Date(l.created_at), 'HH:mm:ss'),
      l.admin_name ?? '',
      ACTION_LABELS[l.action]?.label ?? l.action,
      l.tenant_name ?? '',
      JSON.stringify(l.details),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-logs-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <PageSkeleton kpiCount={0} hasTable />

  const columns: Column<LogEntry>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (l) => (
        <div>
          <p className="text-sm text-immo-text-primary">{format(new Date(l.created_at), 'dd/MM/yyyy')}</p>
          <p className="text-[11px] text-immo-text-secondary">{format(new Date(l.created_at), 'HH:mm:ss')}</p>
        </div>
      ),
    },
    {
      key: 'admin',
      header: 'Admin',
      render: (l) => <span className="text-sm text-immo-text-primary">{l.admin_name}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      render: (l) => {
        const meta = ACTION_LABELS[l.action]
        return <StatusBadge label={meta?.label ?? l.action} type={meta?.color ?? 'muted'} />
      },
    },
    {
      key: 'tenant',
      header: 'Tenant',
      render: (l) => <span className="text-sm text-immo-text-secondary">{l.tenant_name}</span>,
    },
    {
      key: 'details',
      header: 'Details',
      render: (l) => <DetailsCell details={l.details} />,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        subtitle="Historique de toutes les actions super admin"
        actions={
          <Button onClick={exportCSV} variant="ghost" className="border border-immo-border-default text-sm text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-immo-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher dans les logs..."
            className="h-10 w-full rounded-lg border border-immo-border-default bg-immo-bg-card pl-10 pr-4 text-sm text-immo-text-primary placeholder-immo-text-muted outline-none focus:border-[#0579DA]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Filter className="mr-1 h-4 w-4 text-immo-text-secondary" />
          {['all', ...Object.keys(ACTION_LABELS)].map(key => (
            <button
              key={key}
              onClick={() => setActionFilter(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                actionFilter === key
                  ? 'bg-[#0579DA]/15 font-medium text-[#0579DA]'
                  : 'text-immo-text-secondary hover:bg-immo-bg-card-hover'
              }`}
            >
              {key === 'all' ? 'Tous' : ACTION_LABELS[key]?.label ?? key}
            </button>
          ))}
          <span className="ml-auto text-xs text-immo-text-muted">{filtered.length} log(s)</span>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={(l) => l.id}
        pageSize={limit}
        emptyIcon={<ScrollText className="h-10 w-10" />}
        emptyMessage="Aucun log trouve"
        emptyDescription={search || actionFilter !== 'all' ? 'Ajustez les filtres pour elargir les resultats.' : 'Les actions super admin apparaitront ici.'}
      />

      {/* Load more */}
      {logs.length >= limit && (
        <div className="text-center">
          <button
            onClick={() => setLimit(l => l + PAGE_SIZE)}
            className="rounded-lg border border-immo-border-default px-4 py-2 text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary"
          >
            Charger plus...
          </button>
        </div>
      )}
    </div>
  )
}

function DetailsCell({ details }: { details: Record<string, unknown> }) {
  if (!details || Object.keys(details).length === 0) return <span className="text-immo-text-muted">-</span>

  const entries = Object.entries(details).slice(0, 3)
  return (
    <div className="space-y-0.5">
      {entries.map(([key, value]) => (
        <p key={key} className="text-[11px] text-immo-text-secondary">
          <span className="text-immo-text-muted">{key}:</span> {String(value)}
        </p>
      ))}
    </div>
  )
}
