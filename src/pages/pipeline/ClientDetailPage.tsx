import { useState, useMemo } from 'react'
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
import {
  LoadingSpinner,
  StatusBadge,
  ConfirmDialog,
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
import { PlanVisitModal } from './components/modals/PlanVisitModal'
import { AISuggestionsModal } from './components/modals/AISuggestionsModal'
import { ReassignModal } from './components/modals/ReassignModal'
import { useAutoTasks } from '@/hooks/useAutoTasks'

// Avatar color from name
function nameToColor(name: string): string {
  const COLORS = ['#00D4A0', '#3782FF', '#FF9A1E', '#A855F7', '#06B6D4', '#EAB308', '#F97316', '#EC4899']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const [searchParams] = useSearchParams()
  const returnTo = searchParams.get('from') ?? 'pipeline'
  const navigate = useNavigate()
  const { updateClient, updateClientStage } = useClients()
  const userId = useAuthStore((s) => s.session?.user?.id)

  const [showInfo, setShowInfo] = useState(true)
  const [stageConfirm, setStageConfirm] = useState<PipelineStage | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showVisitModal, setShowVisitModal] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  const [showReassignModal, setShowReassignModal] = useState(false)

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
  const { data: projectMap } = useQuery({
    queryKey: ['project-names-map'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name')
      const m = new Map<string, string>()
      for (const p of (data ?? []) as Array<{ id: string; name: string }>) m.set(p.id, p.name)
      return m
    },
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
    return <LoadingSpinner size="lg" className="h-96" />
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
                <Flame className="h-3 w-3" /> HOT
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
            {agentName && <span>Agent : {agentName}</span>}
            {client.interested_projects?.[0] && projectMap && (
              <span>Projet : {projectMap.get(client.interested_projects[0]) ?? '-'}</span>
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
                Modifier le client
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate(`/pipeline/clients/${clientId}?from=${returnTo}#documents`)}
                className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover"
              >
                Generer un document
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (client) {
                    updateClientStage.mutate({ clientId: client.id, newStage: 'perdue' })
                  }
                }}
                className="text-sm text-immo-status-red focus:bg-immo-status-red-bg"
              >
                Marquer comme perdu
              </DropdownMenuItem>
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
            <h3 className="text-sm font-semibold text-immo-text-primary">Informations client</h3>
            <span className="rounded-full bg-immo-bg-card-hover px-2 py-0.5 text-[10px] text-immo-text-muted">
              {filledFields}/21 champs
            </span>
          </div>
          {showInfo ? <ChevronUp className="h-4 w-4 text-immo-text-muted" /> : <ChevronDown className="h-4 w-4 text-immo-text-muted" />}
        </button>

        {showInfo && (
          <div className="border-t border-immo-border-default px-5 py-4">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-3">
              {/* Col 1: Identity */}
              <div className="space-y-3">
                <InfoField label="Nom complet" value={client.full_name} />
                <InfoField label="Téléphone" value={client.phone} />
                <InfoField label="Email" value={client.email} />
                <InfoField label="NIN / CIN" value={client.nin_cin} />
                <InfoField label="Type client" value={client.client_type === 'company' ? 'Entreprise' : 'Particulier'} />
                <InfoField label="Date de naissance" value={client.birth_date ? format(new Date(client.birth_date), 'dd/MM/yyyy') : null} />
                <InfoField label="Nationalité" value={client.nationality} />
              </div>

              {/* Col 2: Commercial */}
              <div className="space-y-3">
                <InfoField label="Étape pipeline" value={stage?.label} badge badgeColor={stage?.color} />
                <InfoField label="Types unités" value={client.desired_unit_types?.map(t => UNIT_TYPE_LABELS[t as UnitType] ?? t).join(', ')} />
                <InfoField label="Projets intérêt" value={client.interested_projects?.map(id => projectMap?.get(id) ?? id).join(', ')} />
                <InfoField label="Budget confirmé" value={client.confirmed_budget != null ? formatPrice(client.confirmed_budget) : null} highlight />
                <InfoField label="Niveau intérêt" value={client.interest_level ? INTEREST_LEVEL_LABELS[client.interest_level as InterestLevel]?.label : null} />
                <InfoField label="Note visite" value={client.visit_note != null ? `${client.visit_note}/5` : null} />
                <InfoField label="Feedback visite" value={client.visit_feedback} />
                <InfoField label="Modalités paiement" value={client.payment_method ? PAYMENT_METHOD_LABELS[client.payment_method as PaymentMethod] : null} />
              </div>

              {/* Col 3: Admin */}
              <div className="space-y-3">
                <InfoField label="Agent assigné" value={agentName} />
                <InfoField label="Date création" value={format(new Date(client.created_at), 'dd/MM/yyyy HH:mm')} />
                <InfoField label="CIN vérifié" value={client.cin_verified ? 'Oui' : 'Non'} badge badgeColor={client.cin_verified ? '#00D4A0' : '#FF4949'} />
                <InfoField label="Notes" value={client.notes} />
                <InfoField label="Profession" value={client.profession} />
                <InfoField label="Source" value={SOURCE_LABELS[client.source as ClientSource]} />
                <InfoField label="Adresse" value={client.address} />
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
        title="Changer l'étape ?"
        description={`Déplacer ce client vers "${stageConfirm ? PIPELINE_STAGES[stageConfirm].label : ''}" ?`}
        confirmLabel="Confirmer"
        loading={updateClientStage.isPending}
      />

      {/* Plan visit modal */}
      <PlanVisitModal
        isOpen={showVisitModal}
        onClose={() => setShowVisitModal(false)}
        client={{ id: client.id, full_name: client.full_name, phone: client.phone, pipeline_stage: client.pipeline_stage, tenant_id: client.tenant_id }}
      />

      {/* AI suggestions modal */}
      <AISuggestionsModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        client={{ id: client.id, full_name: client.full_name, phone: client.phone, confirmed_budget: client.confirmed_budget, desired_unit_types: client.desired_unit_types, interested_projects: client.interested_projects, interest_level: client.interest_level, pipeline_stage: client.pipeline_stage, tenant_id: client.tenant_id }}
      />

      {/* Reassign agent modal */}
      {showReassignModal && (
        <ReassignModal
          isOpen={showReassignModal}
          onClose={() => setShowReassignModal(false)}
          clientId={client.id}
          currentAgentId={client.agent_id}
          tenantId={client.tenant_id}
        />
      )}
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
