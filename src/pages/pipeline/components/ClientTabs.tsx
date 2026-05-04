import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Calendar, Bookmark, DollarSign, CreditCard, FileText, Receipt,
  StickyNote, ListTodo, Clock,
} from 'lucide-react'
import {
  VisitsTab,
  ReservationTab,
  SaleTab,
  ScheduleTab,
  PaymentTab,
  DocumentsTab,
  ChargesTab,
  NotesTab,
  TasksTab,
  HistoryTab,
} from './tabs'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PipelineStage } from '@/types'
// ClientTasksTab and CheckSquare were used by the removed
// `auto_tasks` tab — pruned along with the duplicate.

interface ClientTabsProps {
  clientId: string
  tenantId: string
}

// `auto_tasks` ("Suivi 360") was a duplicate of `tasks` — both
// rendered task lists, with auto_tasks scoping to per-stage tasks
// from task_templates. The user's report: same content shown twice
// under different labels. Keep `tasks` (single tab covers both
// manual and auto-generated since they're all rows in the same
// `tasks` table) and drop `auto_tasks`.
const TAB_KEYS = [
  'visits', 'reservation', 'sale', 'schedule', 'payment',
  'documents', 'charges', 'notes', 'tasks', 'history',
] as const

type TabKey = (typeof TAB_KEYS)[number]

const TAB_ICONS: Record<TabKey, typeof Calendar> = {
  visits: Calendar,
  reservation: Bookmark,
  sale: DollarSign,
  schedule: Clock,
  payment: CreditCard,
  documents: FileText,
  charges: Receipt,
  notes: StickyNote,
  tasks: ListTodo,
  history: Clock,
}

export function ClientTabs({ clientId, tenantId }: ClientTabsProps) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const urlTab = searchParams.get('tab') as TabKey | null
  const [activeTab, setActiveTab] = useState<TabKey>(urlTab && TAB_KEYS.includes(urlTab as typeof TAB_KEYS[number]) ? urlTab : 'visits')

  // Sync with URL param
  useEffect(() => {
    if (urlTab && TAB_KEYS.includes(urlTab as typeof TAB_KEYS[number])) {
      setActiveTab(urlTab)
    }
  }, [urlTab])

  // Fetch client info — needed by tasks tab AND by the
  // CreateReservationModal / NewSaleModal that reservation/sale tabs
  // open. Modals expect id, nin_cin, tenant_id, pipeline_stage in
  // addition to the display fields.
  const { data: clientInfo } = useQuery({
    queryKey: ['client-info-tabs', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, full_name, phone, nin_cin, pipeline_stage, tenant_id')
        .eq('id', clientId)
        .single()
      return data as {
        id: string
        full_name: string
        phone: string
        nin_cin: string | null
        pipeline_stage: PipelineStage
        tenant_id: string
      } | null
    },
  })

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-immo-border-default">
        {TAB_KEYS.map((key) => {
          const Icon = TAB_ICONS[key]
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs transition-colors ${
                activeTab === key
                  ? 'border-immo-accent-green font-medium text-immo-accent-green'
                  : 'border-transparent text-immo-text-muted hover:text-immo-text-secondary'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(`tab.${key}`)}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="pt-5">
        {activeTab === 'visits' && <VisitsTab clientId={clientId} tenantId={tenantId} />}
        {activeTab === 'reservation' && <ReservationTab clientId={clientId} clientInfo={clientInfo ?? null} />}
        {activeTab === 'sale' && <SaleTab clientId={clientId} clientInfo={clientInfo ?? null} />}
        {activeTab === 'schedule' && <ScheduleTab clientId={clientId} />}
        {activeTab === 'payment' && <PaymentTab clientId={clientId} />}
        {activeTab === 'documents' && <DocumentsTab clientId={clientId} />}
        {activeTab === 'charges' && <ChargesTab clientId={clientId} tenantId={tenantId} />}
        {activeTab === 'notes' && <NotesTab clientId={clientId} />}
        {activeTab === 'tasks' && <TasksTab clientId={clientId} tenantId={tenantId} clientPhone={clientInfo?.phone} />}
        {activeTab === 'history' && <HistoryTab clientId={clientId} />}
      </div>
    </div>
  )
}
