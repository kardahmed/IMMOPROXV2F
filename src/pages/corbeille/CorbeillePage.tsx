import { RotateCcw, Inbox } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale'
import { useDeletedClients, useClients } from '@/hooks/useClients'
import { DataTable, PageHeader, PageSkeleton } from '@/components/common'
import type { Column } from '@/components/common'
import { Button } from '@/components/ui/button'

type DeletedClientRow = {
  id: string
  full_name: string
  phone: string
  email: string | null
  pipeline_stage: string
  agent_id: string | null
  deleted_at: string
  deleted_by: string | null
  users: { first_name: string; last_name: string } | null
}

export function CorbeillePage() {
  const { data, isLoading } = useDeletedClients()
  const rows = (data ?? []) as unknown as DeletedClientRow[]
  const { restoreClient } = useClients()

  if (isLoading) return <PageSkeleton kpiCount={0} />

  const columns: Column<DeletedClientRow>[] = [
    {
      key: 'name',
      header: 'Client',
      render: (c) => (
        <div>
          <p className="text-sm font-medium text-immo-text-primary">{c.full_name}</p>
          <p className="text-xs text-immo-text-muted">{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'agent',
      header: 'Agent',
      render: (c) => (
        <span className="text-xs text-immo-text-muted">
          {c.users ? `${c.users.first_name} ${c.users.last_name}` : '-'}
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Etape pipeline',
      render: (c) => <span className="text-xs text-immo-text-muted">{c.pipeline_stage}</span>,
    },
    {
      key: 'deleted',
      header: 'Supprime',
      render: (c) => (
        <span className="text-xs text-immo-text-muted">
          {formatDistanceToNow(new Date(c.deleted_at), { addSuffix: true, locale: frLocale })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (c) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => restoreClient.mutate(c.id)}
          disabled={restoreClient.isPending}
          className="h-7 text-[11px] border border-immo-border-default"
        >
          <RotateCcw className="mr-1 h-3 w-3" /> Restaurer
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Corbeille"
        subtitle="Clients supprimes recemment. Restaure-les si c'etait une erreur."
      />

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        emptyIcon={<Inbox className="h-10 w-10" />}
        emptyMessage="La corbeille est vide"
        emptyDescription="Les clients mis a la corbeille apparaissent ici et peuvent etre restaures."
      />
    </div>
  )
}
