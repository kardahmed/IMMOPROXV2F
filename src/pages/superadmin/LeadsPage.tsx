import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Inbox, Mail, Phone, Building2, Search, UserPlus, Clock, Flame, Compass } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { DataTable, KPICard, PageHeader, PageSkeleton } from '@/components/common'
import type { Column } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { CreateTenantModal, type CreateTenantDefaults } from './components/CreateTenantModal'
import { LeadDetailsModal } from './components/LeadDetailsModal'

interface LeadRow {
  id: string
  full_name: string
  email: string
  phone: string
  company_name: string | null
  activity_type: string | null
  agents_count: string | null
  wilayas: string[] | null
  leads_per_month: string | null
  marketing_budget_monthly: string | null
  acquisition_channels: string[] | null
  current_tools: string | null
  decision_maker: string | null
  decision_maker_names: string | null
  frustration_score: number | null
  timeline: string | null
  message: string | null
  source: string | null
  medium: string | null
  campaign: string | null
  referrer: string | null
  status: 'new' | 'contacted' | 'demo_booked' | 'demo_done' | 'won' | 'lost' | 'nurture'
  notes: string | null
  step_completed: number
  created_at: string
}

type StatusFilter = 'all' | LeadRow['status']

const STATUS_LABELS: Record<LeadRow['status'], string> = {
  new: 'Nouveau',
  contacted: 'Contacte',
  demo_booked: 'RDV pris',
  demo_done: 'RDV fait',
  won: 'Converti',
  lost: 'Perdu',
  nurture: 'Nurture',
}

const STATUS_COLORS: Record<LeadRow['status'], string> = {
  new: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  contacted: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  demo_booked: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  demo_done: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  won: 'bg-green-500/10 text-green-400 border-green-500/20',
  lost: 'bg-red-500/10 text-red-400 border-red-500/20',
  nurture: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
}

const TIMELINE_LABELS: Record<string, string> = {
  this_week: 'Cette semaine',
  this_month: 'Ce mois',
  '3_months': '3 mois',
  browsing: 'En reflexion',
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function formatSource(l: LeadRow): { main: string; sub: string | null; isDirect: boolean } {
  if (l.source) return { main: l.source, sub: l.campaign, isDirect: false }
  if (l.referrer) {
    try {
      return { main: new URL(l.referrer).hostname.replace(/^www\./, ''), sub: null, isDirect: false }
    } catch {
      return { main: 'Externe', sub: null, isDirect: false }
    }
  }
  return { main: 'Direct', sub: null, isDirect: true }
}

export function LeadsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null)
  const [createTenantFor, setCreateTenantFor] = useState<LeadRow | null>(null)

  const { data: leads = [], isLoading, refetch } = useQuery<LeadRow[]>({
    queryKey: ['super-admin-marketing-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_leads')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(handleSupabaseError(error))
      return (data ?? []) as unknown as LeadRow[]
    },
  })

  const filtered = useMemo(() => {
    let rows = leads
    if (statusFilter !== 'all') rows = rows.filter(l => l.status === statusFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(l =>
        l.full_name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.company_name?.toLowerCase().includes(q) ?? false) ||
        l.phone.includes(q),
      )
    }
    return rows
  }, [leads, search, statusFilter])

  const kpis = useMemo(() => ({
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    qualified: leads.filter(l => l.step_completed === 2).length,
    won: leads.filter(l => l.status === 'won').length,
  }), [leads])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: leads.length }
    for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1
    return counts
  }, [leads])

  async function updateStatus(id: string, status: LeadRow['status']) {
    const { error } = await supabase
      .from('marketing_leads')
      .update({ status } as never)
      .eq('id', id)
    if (error) {
      toast.error(handleSupabaseError(error))
      return
    }
    toast.success(`Statut mis a jour: ${STATUS_LABELS[status]}`)
    refetch()
  }

  async function markAsWon(leadId: string) {
    await updateStatus(leadId, 'won')
  }

  const columns: Column<LeadRow>[] = [
    {
      key: 'date',
      header: 'Date',
      width: '110px',
      render: l => (
        <span className="text-xs text-immo-text-secondary">
          {new Date(l.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: l => (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-immo-text-primary">
            {l.full_name}
            {l.step_completed === 2 && (
              <span className="rounded-full bg-green-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-green-400">
                QUALIFIE
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-immo-text-secondary">
            <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {l.email}</span>
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {l.phone}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Agence',
      render: l => l.company_name ? (
        <div className="flex items-center gap-1.5 text-xs text-immo-text-primary">
          <Building2 className="h-3 w-3 text-immo-text-secondary" />
          {l.company_name}
        </div>
      ) : <span className="text-xs text-immo-text-secondary">—</span>,
    },
    {
      key: 'source',
      header: 'Source',
      width: '130px',
      render: l => {
        const s = formatSource(l)
        return (
          <div className={`flex flex-col gap-0.5 text-[11px] ${s.isDirect ? 'text-immo-text-secondary/60' : 'text-immo-text-secondary'}`}>
            <span className="flex items-center gap-1">
              <Compass className="h-3 w-3" />
              <span className={`font-medium ${s.isDirect ? '' : 'text-immo-text-primary'}`}>{s.main}</span>
            </span>
            {s.sub && <span className="truncate pl-4 text-[10px] opacity-75">{s.sub}</span>}
          </div>
        )
      },
    },
    {
      key: 'signals',
      header: 'Signaux',
      render: l => (
        <div className="flex flex-col gap-0.5 text-[11px] text-immo-text-secondary">
          {l.timeline && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {TIMELINE_LABELS[l.timeline] ?? l.timeline}
            </span>
          )}
          {l.frustration_score !== null && (
            <span className="flex items-center gap-1">
              <Flame className={`h-3 w-3 ${l.frustration_score >= 7 ? 'text-orange-400' : ''}`} />
              Frustration {l.frustration_score}/10
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      width: '130px',
      render: l => (
        <select
          value={l.status}
          onClick={e => e.stopPropagation()}
          onChange={e => {
            e.stopPropagation()
            updateStatus(l.id, e.target.value as LeadRow['status'])
          }}
          className={`rounded-md border px-2 py-1 text-[11px] font-medium outline-none ${STATUS_COLORS[l.status]}`}
        >
          {(Object.keys(STATUS_LABELS) as LeadRow['status'][]).map(s => (
            <option key={s} value={s} className="bg-immo-bg-primary text-immo-text-primary">
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '140px',
      render: l => (
        <Button
          size="sm"
          variant="purple"
          onClick={e => {
            e.stopPropagation()
            setCreateTenantFor(l)
          }}
          disabled={l.status === 'won'}
          className="gap-1 text-[11px]"
        >
          <UserPlus className="h-3 w-3" />
          {l.status === 'won' ? 'Converti' : 'Creer tenant'}
        </Button>
      ),
    },
  ]

  if (isLoading) return <PageSkeleton />

  const defaultsFromLead = (l: LeadRow): CreateTenantDefaults => {
    const { first, last } = splitName(l.full_name)
    return {
      name: l.company_name ?? l.full_name,
      email: l.email,
      phone: l.phone,
      wilaya: l.wilayas?.[0] ?? '',
      adminFirstName: first,
      adminLastName: last,
      adminEmail: l.email,
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Leads marketing"
        subtitle={`Demandes de demo depuis immoprox.io/contact — ${leads.length} au total`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPICard label="Total" value={kpis.total} icon={<Inbox className="h-4 w-4" />} />
        <KPICard label="Nouveaux" value={kpis.new} accent="blue" icon={<Mail className="h-4 w-4" />} />
        <KPICard label="Qualifies" value={kpis.qualified} accent="orange" icon={<Flame className="h-4 w-4" />} />
        <KPICard label="Convertis" value={kpis.won} accent="green" icon={<UserPlus className="h-4 w-4" />} />
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', ...Object.keys(STATUS_LABELS)] as StatusFilter[]).map(s => {
          const label = s === 'all' ? 'Tous' : STATUS_LABELS[s as LeadRow['status']]
          const count = statusCounts[s] ?? 0
          const active = statusFilter === s
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'border-[#7C3AED] bg-[#7C3AED]/10 text-[#7C3AED]'
                  : 'border-immo-border-default text-immo-text-secondary hover:bg-immo-bg-card-hover'
              }`}
            >
              {label} <span className="ml-1 opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-immo-text-secondary" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Recherche nom, email, telephone, agence..."
          variant="immo"
          className="pl-9"
        />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        rowKey={l => l.id}
        onRowClick={l => setSelectedLead(l)}
        emptyMessage="Aucun lead"
        emptyDescription={statusFilter === 'all' ? "Les demandes de demo apparaitront ici." : "Aucun lead avec ce statut."}
        pageSize={20}
      />

      {/* Details modal */}
      {selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={s => updateStatus(selectedLead.id, s)}
          onCreateTenant={() => {
            setCreateTenantFor(selectedLead)
            setSelectedLead(null)
          }}
        />
      )}

      {/* Create tenant from lead */}
      {createTenantFor && (
        <CreateTenantModal
          isOpen={!!createTenantFor}
          onClose={() => setCreateTenantFor(null)}
          onSuccess={() => {
            markAsWon(createTenantFor.id)
            setCreateTenantFor(null)
          }}
          defaults={defaultsFromLead(createTenantFor)}
          subtitle={`Creer un tenant a partir du lead: ${createTenantFor.full_name}`}
        />
      )}
    </div>
  )
}
