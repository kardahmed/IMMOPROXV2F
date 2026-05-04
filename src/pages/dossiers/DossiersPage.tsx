import { useState, useMemo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign, CreditCard, AlertTriangle, Clock,
  FileText, Upload,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
const PaymentSchedulePanel = lazy(() => import('./components/PaymentSchedulePanel').then(m => ({ default: m.PaymentSchedulePanel })))
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard, SearchInput, FilterDropdown, PageSkeleton, PageHeader,
  StatusBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { formatPrice, formatPriceCompact } from '@/lib/constants'
import { format } from 'date-fns'

/* ═══ Types ═══ */

interface DossierRow {
  client_id: string
  client_name: string
  client_phone: string
  project_id: string | null
  project_name: string
  unit_codes: string[]
  agent_name: string
  total_price: number
  paid: number
  due: number
  late: number
  next_payment_date: string | null
  next_payment_amount: number
  status: 'reservation' | 'sale' | 'late' | 'cancelled'
  sale_id: string | null
  reservation_id: string | null
}

type TabKey = 'reservations' | 'sales' | 'upcoming' | 'late' | 'cancelled'

const TAB_KEYS: TabKey[] = ['reservations', 'sales', 'upcoming', 'late', 'cancelled']
const TAB_I18N: Record<TabKey, string> = {
  reservations: 'dossiers_extra.tab_reservations',
  sales: 'dossiers_extra.tab_sales',
  upcoming: 'dossiers_extra.tab_upcoming',
  late: 'dossiers_extra.tab_overdue',
  cancelled: 'dossiers_extra.tab_cancelled',
}

/* ═══ Component ═══ */

export function DossiersPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { tenantId, session } = useAuthStore()
  const userId = session?.user?.id
  const { isAgent } = usePermissions()

  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [activeTab, setActiveTab] = useState<TabKey>('sales')
  const [selectedDossier, setSelectedDossier] = useState<{ saleId: string; clientName: string; totalPrice: number } | null>(null)

  // Fetch all data in parallel
  const { data, isLoading } = useQuery({
    queryKey: ['dossiers', tenantId, userId, isAgent],
    queryFn: async () => {
      if (!tenantId) throw new Error('No tenant')

      const [salesRes, reservationsRes, schedulesRes, projectsRes] = await Promise.all([
        (() => {
          let q = supabase
            .from('sales')
            .select('id, client_id, agent_id, project_id, unit_id, final_price, status, clients(full_name, phone), projects(name), units(code), users!sales_agent_id_fkey(first_name, last_name)')
            .eq('tenant_id', tenantId)
          if (isAgent && userId) q = q.eq('agent_id', userId)
          return q
        })(),
        (() => {
          let q = supabase
            .from('reservations')
            .select('id, client_id, agent_id, project_id, unit_id, deposit_amount, status, expires_at, clients(full_name, phone), projects(name), units(code), users!reservations_agent_id_fkey(first_name, last_name)')
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
          if (isAgent && userId) q = q.eq('agent_id', userId)
          return q
        })(),
        supabase
          .from('payment_schedules')
          .select('sale_id, amount, status, due_date')
          .eq('tenant_id', tenantId),
        supabase
          .from('projects')
          .select('id, name')
          .eq('tenant_id', tenantId)
          .eq('status', 'active'),
      ])

      for (const res of [salesRes, reservationsRes, schedulesRes, projectsRes]) {
        if (res.error) { handleSupabaseError(res.error); throw res.error }
      }

      return {
        sales: (salesRes.data ?? []) as unknown as Array<Record<string, unknown>>,
        reservations: (reservationsRes.data ?? []) as unknown as Array<Record<string, unknown>>,
        schedules: (schedulesRes.data ?? []) as unknown as Array<{ sale_id: string; amount: number; status: string; due_date: string }>,
        projects: (projectsRes.data ?? []) as unknown as Array<{ id: string; name: string }>,
      }
    },
    enabled: !!tenantId,
  })

  const sales = data?.sales ?? []
  const reservations = data?.reservations ?? []
  const schedules = data?.schedules ?? []
  const projectsList = data?.projects ?? []

  // Build schedule aggregates per sale.
  // `due` was pre-fix summed from pending + late schedule lines —
  // wrong, because if a sale has total_price=120M and a single paid
  // 40K échéance, the panel would show "Restant 0" (no unpaid lines)
  // while 119,960,000 was actually still owed. The dossier row needs
  // total_price to compute the true `due`, which we don't have in
  // this hook — defer to the consumer (dossiers loop below merges
  // sale.total_price + this aggregate).
  const scheduleAgg = useMemo(() => {
    const map = new Map<string, { paid: number; pending_due: number; late: number; nextDate: string | null; nextAmount: number }>()
    const bySale = new Map<string, typeof schedules>()

    for (const s of schedules) {
      if (!bySale.has(s.sale_id)) bySale.set(s.sale_id, [])
      bySale.get(s.sale_id)!.push(s)
    }

    for (const [saleId, lines] of bySale) {
      const paid = lines.filter(l => l.status === 'paid').reduce((s, l) => s + l.amount, 0)
      const pending = lines.filter(l => l.status === 'pending')
      const lateLines = lines.filter(l => l.status === 'late')
      // Renamed to pending_due to make it explicit this is "what the
      // schedule rows ADD UP TO" and NOT "what the buyer still owes".
      // True restant lives in the dossier row builder below.
      const pending_due = pending.reduce((s, l) => s + l.amount, 0) + lateLines.reduce((s, l) => s + l.amount, 0)
      const late = lateLines.reduce((s, l) => s + l.amount, 0)

      const upcoming = pending.sort((a, b) => a.due_date.localeCompare(b.due_date))
      const next = upcoming[0] ?? lateLines.sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

      map.set(saleId, {
        paid,
        pending_due,
        late,
        nextDate: next?.due_date ?? null,
        nextAmount: next?.amount ?? 0,
      })
    }
    return map
  }, [schedules])

  // Build dossier rows
  const dossiers = useMemo((): DossierRow[] => {
    const rows: DossierRow[] = []

    // Sales
    for (const s of sales) {
      const client = s.clients as { full_name: string; phone: string } | null
      const project = s.projects as { name: string } | null
      const unit = s.units as { code: string } | null
      const agent = s.users as { first_name: string; last_name: string } | null
      const saleId = s.id as string
      const agg = scheduleAgg.get(saleId)

      rows.push({
        client_id: s.client_id as string,
        client_name: client?.full_name ?? '-',
        client_phone: client?.phone ?? '',
        project_id: (s.project_id as string | null) ?? null,
        project_name: project?.name ?? '-',
        unit_codes: unit ? [unit.code] : [],
        agent_name: agent ? `${agent.first_name} ${agent.last_name}` : '-',
        total_price: s.final_price as number,
        paid: agg?.paid ?? 0,
        // Restant = total contract price - what's actually been paid,
        // not "sum of unpaid schedule rows". A sale with no schedule
        // yet rendered as restant=0 even when the buyer owed the full
        // 120M; now restant === total_price in that case until
        // payments are recorded.
        due: Math.max(0, (s.final_price as number) - (agg?.paid ?? 0)),
        late: agg?.late ?? 0,
        next_payment_date: agg?.nextDate ?? null,
        next_payment_amount: agg?.nextAmount ?? 0,
        status: (agg?.late ?? 0) > 0 ? 'late' : s.status === 'cancelled' ? 'cancelled' : 'sale',
        sale_id: saleId,
        reservation_id: null,
      })
    }

    // Reservations without sale
    const saleClientUnits = new Set(sales.map(s => `${s.client_id}-${s.unit_id}`))
    for (const r of reservations) {
      const key = `${r.client_id}-${r.unit_id}`
      if (saleClientUnits.has(key)) continue
      const client = r.clients as { full_name: string; phone: string } | null
      const project = r.projects as { name: string } | null
      const unit = r.units as { code: string } | null
      const agent = r.users as { first_name: string; last_name: string } | null

      rows.push({
        client_id: r.client_id as string,
        client_name: client?.full_name ?? '-',
        client_phone: client?.phone ?? '',
        project_id: (r.project_id as string | null) ?? null,
        project_name: project?.name ?? '-',
        unit_codes: unit ? [unit.code] : [],
        agent_name: agent ? `${agent.first_name} ${agent.last_name}` : '-',
        total_price: (r.deposit_amount as number) ?? 0,
        paid: (r.deposit_amount as number) ?? 0,
        due: 0,
        late: 0,
        next_payment_date: r.expires_at as string,
        next_payment_amount: 0,
        status: r.status === 'cancelled' ? 'cancelled' : 'reservation',
        sale_id: null,
        reservation_id: r.id as string,
      })
    }

    return rows
  }, [sales, reservations, scheduleAgg])

  // KPIs
  const kpi = useMemo(() => {
    const activeSales = dossiers.filter(d => d.status === 'sale' || d.status === 'late')
    return {
      totalSales: activeSales.length,
      totalCA: activeSales.reduce((s, d) => s + d.total_price, 0),
      collected: activeSales.reduce((s, d) => s + d.paid, 0),
      totalDue: activeSales.reduce((s, d) => s + d.due, 0),
      totalLate: activeSales.reduce((s, d) => s + d.late, 0),
      lateDossiers: activeSales.filter(d => d.late > 0).length,
    }
  }, [dossiers])

  // Filter
  const filtered = useMemo(() => {
    let list = dossiers

    // Tab filter
    switch (activeTab) {
      case 'reservations': list = list.filter(d => d.status === 'reservation'); break
      case 'sales': list = list.filter(d => d.status === 'sale' || d.status === 'late'); break
      case 'upcoming': list = list.filter(d => d.next_payment_date && d.due > 0 && d.status !== 'cancelled'); break
      case 'late': list = list.filter(d => d.late > 0); break
      case 'cancelled': list = list.filter(d => d.status === 'cancelled'); break
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(d => d.client_name.toLowerCase().includes(q) || d.client_phone.includes(q))
    }

    // Project — filter by ID, not name. Audit (HIGH): the previous
    // version compared `d.project_name` to a project name resolved
    // from id, which broke whenever two projects had the same name.
    if (projectFilter !== 'all') {
      list = list.filter(d => d.project_id === projectFilter)
    }

    return list
  }, [dossiers, activeTab, search, projectFilter])

  // Tab counts
  const tabCounts = useMemo(() => ({
    reservations: dossiers.filter(d => d.status === 'reservation').length,
    sales: dossiers.filter(d => d.status === 'sale' || d.status === 'late').length,
    upcoming: dossiers.filter(d => d.next_payment_date && d.due > 0 && d.status !== 'cancelled').length,
    late: dossiers.filter(d => d.late > 0).length,
    cancelled: dossiers.filter(d => d.status === 'cancelled').length,
  }), [dossiers])

  const projectOptions = [
    { value: 'all', label: t('dossiers_extra.all_projects') },
    ...projectsList.map(p => ({ value: p.id, label: p.name })),
  ]

  if (isLoading) return <PageSkeleton kpiCount={4} hasTable />

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav.dossiers')}
        subtitle={t('dossiers_extra.subtitle')}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KPICard label={t('dossiers_extra.kpi_total_sales')} value={kpi.totalSales} accent="blue" icon={<FileText className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label={t('dossiers_extra.kpi_total_revenue')} value={formatPriceCompact(kpi.totalCA)} accent="green" icon={<DollarSign className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label={t('dossiers_extra.kpi_collected')} value={formatPriceCompact(kpi.collected)} accent="green" icon={<CreditCard className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label={t('dossiers_extra.kpi_total_due')} value={formatPriceCompact(kpi.totalDue)} accent="orange" icon={<Clock className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label={t('dossiers_extra.kpi_overdue')} value={formatPriceCompact(kpi.totalLate)} accent="red" icon={<AlertTriangle className="h-4 w-4 text-immo-status-red" />} />
        <KPICard label={t('dossiers_extra.kpi_overdue_files')} value={kpi.lateDossiers} accent="red" icon={<AlertTriangle className="h-4 w-4 text-immo-status-red" />} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput placeholder={t('dossiers_extra.search_placeholder')} value={search} onChange={setSearch} className="w-[240px]" />
        <FilterDropdown label={t('dossiers_extra.header_project')} options={projectOptions} value={projectFilter} onChange={setProjectFilter} />
        <Button variant="ghost" size="sm" onClick={() => toast(t('dossiers_extra.import_soon'))} className="border border-immo-border-default text-xs text-immo-text-muted">
          <Upload className="me-1 h-3.5 w-3.5" /> {t('dossiers_extra.import_csv')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-immo-border-default">
        {TAB_KEYS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setActiveTab(tabKey)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs transition-colors ${
              activeTab === tabKey
                ? 'border-immo-accent-green font-medium text-immo-accent-green'
                : 'border-transparent text-immo-text-muted hover:text-immo-text-secondary'
            }`}
          >
            {t(TAB_I18N[tabKey])}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
              activeTab === tabKey ? 'bg-immo-accent-green/10' : 'bg-immo-bg-card-hover'
            }`}>
              {tabCounts[tabKey]}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-immo-text-muted">{t('dossiers_extra.no_files')}</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-immo-border-default">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-immo-bg-card-hover">
                  {[
                    t('dossiers_extra.header_client'),
                    t('dossiers_extra.header_project'),
                    t('dossiers_extra.header_units'),
                    t('dossiers_extra.header_total'),
                    t('dossiers_extra.header_collected'),
                    t('dossiers_extra.header_remaining'),
                    t('dossiers_extra.header_next_payment'),
                    t('dossiers_extra.header_status'),
                    t('dossiers_extra.header_agent'),
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-start text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-immo-border-default">
                {filtered.map((d, i) => {
                  const hasLate = d.late > 0
                  return (
                    <tr
                      key={`${d.client_id}-${d.sale_id ?? d.reservation_id ?? i}`}
                      onClick={() => d.sale_id ? setSelectedDossier({ saleId: d.sale_id, clientName: d.client_name, totalPrice: d.total_price }) : navigate(`/pipeline/clients/${d.client_id}?from=dossiers`)}
                      className={`cursor-pointer transition-colors ${hasLate ? 'bg-immo-status-red-bg/30' : 'bg-immo-bg-card'} hover:bg-immo-bg-card-hover`}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-immo-text-primary">{d.client_name}</p>
                          <p className="text-[11px] text-immo-text-muted">{d.client_phone}</p>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-secondary">{d.project_name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-mono text-immo-text-muted">{d.unit_codes.join(', ') || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-immo-text-primary">{formatPrice(d.total_price)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-accent-green">{formatPrice(d.paid)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`text-xs font-medium ${d.due > 0 ? (hasLate ? 'text-immo-status-red' : 'text-immo-status-orange') : 'text-immo-text-muted'}`}>
                          {d.due > 0 ? formatPrice(d.due) : '-'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {d.next_payment_date ? (
                          <div>
                            <p className="text-xs text-immo-text-primary">{format(new Date(d.next_payment_date), 'dd/MM/yyyy')}</p>
                            {d.next_payment_amount > 0 && (
                              <p className="text-[10px] text-immo-text-muted">{formatPriceCompact(d.next_payment_amount)}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-immo-text-muted">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge
                          label={
                            d.status === 'late' ? t('dossiers_extra.status_late')
                            : d.status === 'sale' ? t('dossiers_extra.status_sale')
                            : d.status === 'reservation' ? t('dossiers_extra.status_reservation')
                            : t('dossiers_extra.status_cancelled')
                          }
                          type={
                            d.status === 'late' ? 'red'
                            : d.status === 'sale' ? 'green'
                            : d.status === 'reservation' ? 'orange'
                            : 'muted'
                          }
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-muted">{d.agent_name}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-immo-border-default bg-immo-bg-card-hover px-4 py-2 text-xs text-immo-text-muted">
            {filtered.length} {t('dossiers_extra.files_count')}
          </div>
        </div>
      )}

      {/* Payment Schedule Panel */}
      {selectedDossier && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-immo-text-primary">{t('dossiers_extra.schedule_title')} — {selectedDossier.clientName}</h3>
            <button onClick={() => setSelectedDossier(null)} className="text-xs text-immo-text-muted hover:text-immo-text-primary">{t('dossiers_extra.close')} ✕</button>
          </div>
          <Suspense fallback={<div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" /></div>}>
            <PaymentSchedulePanel saleId={selectedDossier.saleId} totalPrice={selectedDossier.totalPrice} clientName={selectedDossier.clientName} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
