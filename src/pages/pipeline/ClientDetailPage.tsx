import { useState, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronRight,
  Star,
  MoreHorizontal,
  Flame,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useClients } from '@/hooks/useClients'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
  PageSkeleton,
  StatusBadge,
  ConfirmDialog,
  EngagementBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PIPELINE_STAGES,
  SOURCE_LABELS,
  INTEREST_LEVEL_LABELS,
  PAYMENT_METHOD_LABELS,
  UNIT_TYPE_LABELS,
  HISTORY_TYPE_LABELS,
} from '@/types'
import type {
  Client,
  PipelineStage,
  ClientSource,
  InterestLevel,
  PaymentMethod,
  UnitType,
  HistoryType,
} from '@/types'
import { formatPrice } from '@/lib/constants'
import { format } from 'date-fns'

import { PipelineTimeline } from './components/PipelineTimeline'
import { QuickActions } from './components/QuickActions'
import { ClientTabs } from './components/ClientTabs'
import { ClientFormModal } from './components/ClientFormModal'
// Lazy-load rarely-opened modals — they add ~40 kB to the initial page chunk
const PlanVisitModal = lazy(() => import('./components/modals/PlanVisitModal').then(m => ({ default: m.PlanVisitModal })))
const AISuggestionsModal = lazy(() => import('./components/modals/AISuggestionsModal').then(m => ({ default: m.AISuggestionsModal })))
const ReassignModal = lazy(() => import('./components/modals/ReassignModal').then(m => ({ default: m.ReassignModal })))
import { useAutoTasks } from '@/hooks/useAutoTasks'
import { nameToColor } from '@/lib/avatarColor'

export function ClientDetailPage() {
  const { t } = useTranslation()
  const { clientId } = useParams<{ clientId: string }>()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('from') ?? 'pipeline'
  const navigate = useNavigate()
  const { updateClient, updateClientStage, softDeleteClient } = useClients()
  const userId = useAuthStore((s) => s.session?.user?.id)
  const { isAdmin, isSuperAdmin } = usePermissions()
  const canSoftDelete = isAdmin || isSuperAdmin

  const [showInfo, setShowInfo] = useState(true)
  const [stageConfirm, setStageConfirm] = useState<PipelineStage | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showVisitModal, setShowVisitModal] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  const [showReassignModal, setShowReassignModal] = useState(false)
  const [showSoftDeleteConfirm, setShowSoftDeleteConfirm] = useState(false)

  // Fetch client
  const { data: rawClient, isLoading } = useQuery({
    queryKey: ['client-detail', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*, users!clients_agent_id_fkey(first_name, last_name)')
        .eq('id', clientId!)
        .single()
      if (error) { handleSupabaseError(error); throw error }
      return data
    },
    enabled: !!clientId,
  })

  const client = rawClient as (Client & { users: { first_name: string; last_name: string } | null }) | undefined

  // History entry creation for quick actions
  const addHistoryEntry = async (input: { client_id: string; agent_id: string; type: string; title: string }) => {
    await supabase.from('history').insert({ tenant_id: client?.tenant_id, ...input } as never)
  }

  // Project names lookup
  // Audit (HIGH): the previous version had no tenant_id filter, so
  // a super_admin querying the page would receive every project of
  // every tenant. Always scope to the client's tenant.
  const clientTenantId = client?.tenant_id ?? null
  const { data: projectMap } = useQuery({
    queryKey: ['project-names-map', clientTenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('tenant_id', clientTenantId!)
      const m = new Map<string, string>()
      for (const p of (data ?? []) as Array<{ id: string; name: string }>) m.set(p.id, p.name)
      return m
    },
    enabled: !!clientTenantId,
    staleTime: 300_000,
  })

  // Derived data
  const agentName = client?.users ? `${client.users.first_name} ${client.users.last_name}` : null
  const stage = client ? PIPELINE_STAGES[client.pipeline_stage] : null
  const isHot = client
    && client.interest_level === 'high'
    && (client.confirmed_budget ?? 0) > 0
    && ['negociation', 'reservation', 'vente'].includes(client.pipeline_stage)

  // Count filled fields
  const filledFields = useMemo(() => {
    if (!client) return 0
    const fields = [
      client.full_name, client.phone, client.email, client.nin_cin,
      client.client_type, client.birth_date, client.nationality,
      client.pipeline_stage, client.desired_unit_types, client.interested_projects,
      client.confirmed_budget, client.interest_level, client.visit_note,
      client.visit_feedback, client.payment_method, client.agent_id,
      client.profession, client.source, client.address, client.notes, client.cin_verified,
    ]
    return fields.filter((f) => f != null && f !== '' && f !== false && (!Array.isArray(f) || f.length > 0)).length
  }, [client])

  // Handlers
  function handleTogglePriority() {
    if (!client) return
    updateClient.mutate({ id: client.id, is_priority: !client.is_priority })
  }

  function handleStageClick(newStage: PipelineStage) {
    if (!client || newStage === client.pipeline_stage) return
    setStageConfirm(newStage)
  }

  const { generateForStage } = useAutoTasks()

  function confirmStageChange() {
    if (!client || !stageConfirm) return
    const oldStage = client.pipeline_stage
    updateClientStage.mutate({ clientId: client.id, newStage: stageConfirm }, {
      onSuccess: () => {
        // Auto-generate tasks for new stage + cancel old stage tasks
        generateForStage.mutate({ clientId: client.id, newStage: stageConfirm, oldStage })
      },
    })
    setStageConfirm(null)
  }

  async function handleQuickAction(action: string) {
    if (!client || !userId) return

    await addHistoryEntry({
      client_id: client.id,
      agent_id: userId,
      type: action,
      title: HISTORY_TYPE_LABELS[action as HistoryType]?.label ?? action,
    })
  }

  if (isLoading || !client) {
    return <PageSkeleton kpiCount={0} />
  }

  const color = nameToColor(client.full_name)
  const initials = client.full_name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const backPath = returnTo === 'dossiers' ? '/dossiers' : '/pipeline'

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-immo-text-muted">
        <Link to={backPath} className="hover:text-immo-text-primary">
          {returnTo === 'dossiers' ? 'Dossiers' : 'Pipeline'}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-immo-text-primary">{client.full_name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(backPath)}
          className="mt-1 text-immo-text-muted hover:text-immo-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Avatar large */}
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold"
          style={{ backgroundColor: color + '20', color }}
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-immo-text-primary">{client.full_name}</h1>
            <EngagementBadge score={(client as { engagement_score?: number | null }).engagement_score} size="md" />
            {stage && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{ backgroundColor: stage.color + '20', color: stage.color }}
              >
                {stage.label}
              </span>
            )}
            <StatusBadge
              label={SOURCE_LABELS[client.source as ClientSource] ?? client.source}
              type="muted"
            />
            {isHot && (
              <span className="flex items-center gap-1 rounded-full bg-immo-status-red-bg px-2 py-0.5 text-[11px] font-semibold text-immo-status-red">
                <Flame className="h-3 w-3" /> {t('client_detail.hot_label')}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-immo-text-muted">
            <span className="flex items-center gap-2">
              {client.phone}
              <a
                href={`https://wa.me/${client.phone.replace(/[\s\-\(\)]/g, '').replace(/^0/, '213')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#25D366] hover:text-[#128C7E]"
                title="WhatsApp"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12.001 2C6.478 2 2 6.478 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.932-1.39A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.524 2 12.001 2z"/></svg>
              </a>
            </span>
            {agentName && <span>{t('client_detail.agent_label', { name: agentName })}</span>}
            {client.interested_projects?.[0] && projectMap && (
              <span>{t('client_detail.project_label', { name: projectMap.get(client.interested_projects[0]) ?? '-' })}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTogglePriority}
            className={client.is_priority ? 'text-immo-status-orange' : 'text-immo-text-muted hover:text-immo-status-orange'}
          >
            <Star className={`h-4 w-4 ${client.is_priority ? 'fill-current' : ''}`} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md border border-immo-border-default text-immo-text-muted hover:text-immo-text-primary">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-immo-border-default bg-immo-bg-card">
              <DropdownMenuItem
                onClick={() => setShowEditModal(true)}
                className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover"
              >
                {t('client_detail.edit_client')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate(`/pipeline/clients/${clientId}?from=${returnTo}#documents`)}
                className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover"
              >
                {t('client_detail.generate_doc')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  // Audit (HIGH): un clic accidentel détruit
                  // l'historique de pipeline. Passer par le confirm
                  // pattern qui existe déjà pour les autres changements
                  // d'étape.
                  if (client) setStageConfirm('perdue')
                }}
                className="text-sm text-immo-status-red focus:bg-immo-status-red-bg"
              >
                {t('client_detail.mark_lost')}
              </DropdownMenuItem>
              {canSoftDelete && (
                <DropdownMenuItem
                  onClick={() => setShowSoftDeleteConfirm(true)}
                  className="text-sm text-immo-status-red focus:bg-immo-status-red-bg"
                >
                  {t('client_detail.send_to_trash')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Quick actions */}
      <QuickActions
        clientId={client.id}
        clientName={client.full_name}
        clientPhone={client.phone}
        clientEmail={client.email}
        clientStage={client.pipeline_stage}
        tenantId={client.tenant_id}
        agentId={userId ?? ''}
        agentName={agentName ?? undefined}
        projectName={client.interested_projects?.[0] && projectMap ? projectMap.get(client.interested_projects[0]) ?? undefined : undefined}
        onAction={handleQuickAction}
        onOpenVisit={() => setShowVisitModal(true)}
        onOpenAI={() => setShowAIModal(true)}
        onOpenReassign={() => setShowReassignModal(true)}
      />

      {/* Pipeline timeline */}
      <div className="pt-2 pb-4">
        <PipelineTimeline currentStage={client.pipeline_stage} onStageClick={handleStageClick} />
      </div>

      {/* Client info section */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card">
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="flex w-full items-center justify-between px-5 py-3"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-immo-text-primary">{t('client_detail.client_info')}</h3>
            <span className="rounded-full bg-immo-bg-card-hover px-2 py-0.5 text-[10px] text-immo-text-muted">
              {t('client_detail.fields_filled', { count: filledFields })}
            </span>
          </div>
          {showInfo ? <ChevronUp className="h-4 w-4 text-immo-text-muted" /> : <ChevronDown className="h-4 w-4 text-immo-text-muted" />}
        </button>

        {showInfo && (
          <div className="border-t border-immo-border-default px-5 py-4">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-3">
              {/* Col 1: Identity */}
              <div className="space-y-3">
                <InfoField label={t('client_detail.full_name')} value={client.full_name} />
                <InfoField label={t('client_detail.phone')} value={client.phone} />
                <InfoField label={t('client_detail.email')} value={client.email} />
                <InfoField label={t('client_detail.nin_cin')} value={client.nin_cin} />
                <InfoField label={t('client_detail.client_type')} value={client.client_type === 'company' ? t('client_detail.company') : t('client_detail.individual')} />
                <InfoField label={t('client_detail.birth_date')} value={client.birth_date ? format(new Date(client.birth_date), 'dd/MM/yyyy') : null} />
                <InfoField label={t('client_detail.nationality')} value={client.nationality} />
              </div>

              {/* Col 2: Commercial */}
              <div className="space-y-3">
                <InfoField label={t('client_detail.pipeline_stage')} value={stage?.label} badge badgeColor={stage?.color} />
                <InfoField label={t('client_detail.unit_types')} value={client.desired_unit_types?.map(ut => UNIT_TYPE_LABELS[ut as UnitType] ?? ut).join(', ')} />
                <InfoField label={t('client_detail.interested_projects')} value={client.interested_projects?.map(id => projectMap?.get(id) ?? id).join(', ')} />
                <InfoField label={t('client_detail.confirmed_budget')} value={client.confirmed_budget != null ? formatPrice(client.confirmed_budget) : null} highlight />
                <InfoField label={t('client_detail.interest_level')} value={client.interest_level ? INTEREST_LEVEL_LABELS[client.interest_level as InterestLevel]?.label : null} />
                <InfoField label={t('client_detail.visit_note')} value={client.visit_note != null ? `${client.visit_note}/5` : null} />
                <InfoField label={t('client_detail.visit_feedback')} value={client.visit_feedback} />
                <InfoField label={t('client_detail.payment_method')} value={client.payment_method ? PAYMENT_METHOD_LABELS[client.payment_method as PaymentMethod] : null} />
              </div>

              {/* Col 3: Admin */}
              <div className="space-y-3">
                <InfoField label={t('client_detail.assigned_agent')} value={agentName} />
                <InfoField label={t('client_detail.creation_date')} value={client.created_at ? format(new Date(client.created_at), 'dd/MM/yyyy HH:mm') : '—'} />
                <InfoField label={t('client_detail.cin_verified')} value={client.cin_verified ? t('common.yes') : t('common.no')} badge badgeColor={client.cin_verified ? '#00D4A0' : '#FF4949'} />
                <InfoField label={t('client_detail.notes')} value={client.notes} />
                <InfoField label={t('client_detail.profession')} value={client.profession} />
                <InfoField label={t('client_detail.source')} value={SOURCE_LABELS[client.source as ClientSource]} />
                <InfoField label={t('client_detail.address')} value={client.address} />
              </div>
            </div>
          </div>
        )}
      </div>

      <Separator className="bg-immo-border-default" />

      {/* Client tabs: Visites, Réservation, Vente, etc. */}
      <ClientTabs clientId={client.id} tenantId={client.tenant_id} />

      {/* Edit client modal */}
      <ClientFormModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} client={client} />

      {/* Stage change confirm */}
      <ConfirmDialog
        isOpen={!!stageConfirm}
        onClose={() => setStageConfirm(null)}
        onConfirm={confirmStageChange}
        title={t('client_detail.change_stage')}
        description={t('client_detail.move_to', { stage: stageConfirm ? PIPELINE_STAGES[stageConfirm].label : '' })}
        confirmLabel={t('action.confirm')}
        loading={updateClientStage.isPending}
      />

      {/* Soft-delete (corbeille) confirm — admin + super_admin only */}
      <ConfirmDialog
        isOpen={showSoftDeleteConfirm}
        onClose={() => setShowSoftDeleteConfirm(false)}
        onConfirm={() => {
          if (!client) return
          softDeleteClient.mutate(client.id, {
            onSuccess: () => {
              setShowSoftDeleteConfirm(false)
              navigate(backPath)
            },
          })
        }}
        title={t('client_detail.trash_confirm_title')}
        description={t('client_detail.trash_confirm_desc', { name: client.full_name })}
        confirmLabel={t('client_detail.send_to_trash')}
        loading={softDeleteClient.isPending}
      />

      {/* Lazy-loaded modals — only mount (and fetch their chunk) when opened */}
      <Suspense fallback={null}>
        {showVisitModal && (
          <PlanVisitModal
            isOpen={showVisitModal}
            onClose={() => setShowVisitModal(false)}
            client={{ id: client.id, full_name: client.full_name, phone: client.phone, pipeline_stage: client.pipeline_stage, tenant_id: client.tenant_id }}
          />
        )}
        {showAIModal && (
          <AISuggestionsModal
            isOpen={showAIModal}
            onClose={() => setShowAIModal(false)}
            client={{ id: client.id, full_name: client.full_name, phone: client.phone, confirmed_budget: client.confirmed_budget, desired_unit_types: client.desired_unit_types, interested_projects: client.interested_projects, interest_level: client.interest_level, pipeline_stage: client.pipeline_stage, tenant_id: client.tenant_id }}
          />
        )}
        {showReassignModal && (
          <ReassignModal
            isOpen={showReassignModal}
            onClose={() => setShowReassignModal(false)}
            clientId={client.id}
            currentAgentId={client.agent_id}
            tenantId={client.tenant_id}
          />
        )}
      </Suspense>
    </div>
  )
}

// Info field sub-component
function InfoField({
  label,
  value,
  highlight,
  badge,
  badgeColor,
}: {
  label: string
  value: string | null | undefined
  highlight?: boolean
  badge?: boolean
  badgeColor?: string
}) {
  const empty = value == null || value === ''

  return (
    <div>
      <p className="text-[11px] text-immo-text-muted">{label}</p>
      {badge && !empty ? (
        <span
          className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: (badgeColor ?? '#7F96B7') + '20', color: badgeColor ?? '#7F96B7' }}
        >
          {value}
        </span>
      ) : (
        <p className={`mt-0.5 text-sm ${
          empty
            ? 'text-immo-text-muted italic'
            : highlight
              ? 'font-semibold text-immo-accent-green'
              : 'text-immo-text-primary'
        }`}>
          {empty ? '—' : value}
        </p>
      )}
    </div>
  )
}
