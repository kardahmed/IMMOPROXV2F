import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, Clock, Phone, MessageCircle, Mail, AlertTriangle,
  Zap, SkipForward, Calendar, Settings, FileText,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { KPICard, FilterDropdown, PageSkeleton, StatusBadge } from '@/components/common'
import { PIPELINE_STAGES } from '@/types'
import { formatDistanceToNow, isToday, isTomorrow, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { TaskConfigSection } from '@/pages/settings/sections/TaskConfigSection'
import { TaskDetailModal } from './components/TaskDetailModal'
import { CallModeOverlay } from './components/CallModeOverlay'
import { MessagesTemplateTab } from './components/MessagesTemplateTab'
import { deriveDisplayStatus, DISPLAY_STATUS_META, buildStatusPayload } from '@/lib/taskStatus'
import { CHANNEL_ICONS } from '@/lib/channelIcons'

interface ClientTask {
  id: string; title: string; stage: string; status: string; priority: string
  channel: string; scheduled_at: string | null; completed_at: string | null
  created_at: string; client_id: string; agent_id: string | null; tenant_id: string
  client?: { full_name: string; phone: string; pipeline_stage: string } | null
  agent?: { first_name: string; last_name: string } | null
}

type TabKey = 'today' | 'overdue' | 'upcoming' | 'completed' | 'messages' | 'config'

// Status display now derived via deriveDisplayStatus + DISPLAY_STATUS_META
// (see @/lib/taskStatus). The post-028 DB enum is only pending|done|ignored;
// the 6 visible states are derived from auxiliary fields.

export function TasksPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { tenantId } = useAuthStore()
  const userId = useAuthStore(s => s.session?.user?.id)
  const { isAgent } = usePermissions()
  const qc = useQueryClient()

  const [tab, setTab] = useState<TabKey>('today')
  const [agentFilter, setAgentFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')
  const [detailTask, setDetailTask] = useState<ClientTask | null>(null)
  // Tracks the task currently in full-screen "Mode Appel". Set when the
  // user taps the inline "Appeler" button on a CALL task — opens the
  // overlay directly without going through TaskDetailModal first, so
  // the field-agent workflow stays one tap.
  const [callTask, setCallTask] = useState<ClientTask | null>(null)

  // Fetch all tasks with client + agent relations (post-028 unified)
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['all-tasks', tenantId],
    queryFn: async () => {
      let query = supabase.from('tasks')
        .select('*, clients(full_name, phone, pipeline_stage), users!tasks_agent_id_fkey(first_name, last_name)')
        .eq('tenant_id', tenantId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500)

      if (isAgent && userId) {
        query = query.eq('agent_id', userId)
      }

      const { data, error } = await query
      if (error) { handleSupabaseError(error); return [] }
      return (data ?? []).map((t: Record<string, unknown>) => ({
        ...t,
        client: t.clients as ClientTask['client'],
        agent: t.users as ClientTask['agent'],
      })) as ClientTask[]
    },
    enabled: !!tenantId,
    refetchInterval: 60_000,
  })

  // Agents for filter
  const { data: agents = [] } = useQuery({
    queryKey: ['task-agents', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name').eq('tenant_id', tenantId!).in('role', ['agent', 'admin']).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>
    },
    enabled: !!tenantId && !isAgent,
  })

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').update(buildStatusPayload('completed')).eq('id', taskId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-tasks'] }); toast.success('Tâche terminée') },
  })

  const skipTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').update(buildStatusPayload('skipped')).eq('id', taskId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-tasks'] }),
  })

  // Fetch agent + tenant info for variable replacement
  const { data: agentInfo } = useQuery({
    queryKey: ['task-agent-info', userId],
    queryFn: async () => {
      const [agentRes, tenantRes] = await Promise.all([
        supabase.from('users').select('first_name, last_name, phone').eq('id', userId!).single(),
        supabase.from('tenants').select('name, phone').eq('id', tenantId!).single(),
      ])
      return {
        agent_nom: `${(agentRes.data as Record<string,string>)?.first_name ?? ''} ${(agentRes.data as Record<string,string>)?.last_name ?? ''}`.trim(),
        agent_prenom: (agentRes.data as Record<string,string>)?.first_name ?? '',
        agent_phone: (agentRes.data as Record<string,string>)?.phone ?? '',
        agence: (tenantRes.data as Record<string,string>)?.name ?? '',
      }
    },
    enabled: !!userId && !!tenantId,
  })

  // Fetch message templates
  const { data: msgTemplates = [] } = useQuery({
    queryKey: ['task-msg-templates', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('message_templates').select('*').eq('tenant_id', tenantId!)
      return (data ?? []) as Array<{ stage: string; trigger_type: string; body: string; channel: string; attached_file_types: string[] }>
    },
    enabled: !!tenantId,
  })

  function replaceVariables(text: string, task: ClientTask): string {
    const clientName = task.client?.full_name ?? ''
    const parts = clientName.split(' ')
    return text
      .replace(/\\n/g, '\n')
      .replace(/\{client_nom\}/g, clientName)
      .replace(/\{client_prenom\}/g, parts[0] ?? '')
      .replace(/\{client_phone\}/g, task.client?.phone ?? '')
      .replace(/\{client_budget\}/g, '')
      .replace(/\{agent_nom\}/g, agentInfo?.agent_nom ?? '')
      .replace(/\{agent_prenom\}/g, agentInfo?.agent_prenom ?? '')
      .replace(/\{agent_phone\}/g, agentInfo?.agent_phone ?? '')
      .replace(/\{agence\}/g, agentInfo?.agence ?? '')
      .replace(/\{projet\}/g, '')
      .replace(/\{prix_min\}/g, '')
      .replace(/\{date_visite\}/g, '')
      .replace(/\{heure_visite\}/g, '')
      .replace(/\{adresse_projet\}/g, '')
      .replace(/\{lien_maps\}/g, '')
  }

  function getMessageForTask(task: ClientTask): string {
    // Find matching message template
    const tpl = msgTemplates.find(m => m.stage === task.stage)
      ?? msgTemplates.find(m => m.channel === task.channel)
    if (tpl?.body) return replaceVariables(tpl.body, task)
    // Fallback
    const name = task.client?.full_name?.split(' ')[0] ?? ''
    return `Bonjour ${name},\n\nJe suis ${agentInfo?.agent_prenom ?? ''} de ${agentInfo?.agence ?? ''}.\n\n${task.title}\n\nCordialement,\n${agentInfo?.agent_prenom ?? ''}\n${agentInfo?.agent_phone ?? ''}`
  }

  async function executeTask(task: ClientTask) {
    const phone = task.client?.phone ?? ''
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^0/, '213')
    const message = getMessageForTask(task)

    if (task.channel === 'whatsapp') {
      // Try API first, fallback to wa.me
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ to: cleanPhone, template_name: 'bienvenue_client', variables: [task.client?.full_name?.split(' ')[0] ?? '', agentInfo?.agent_prenom ?? '', agentInfo?.agence ?? ''], client_id: task.client_id }),
          })
          if (res.ok) {
            const data = await res.json()
            completeTask.mutate(task.id)
            toast.success(`WhatsApp envoye automatiquement (${data.remaining} restants)`)
            return
          }
        }
      } catch { /* fallback */ }
      // Fallback: open wa.me
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank')
      completeTask.mutate(task.id)
      toast.success(t('tasks_page.toast_whatsapp'))
    } else if (task.channel === 'sms') {
      window.open(`sms:${phone}?body=${encodeURIComponent(message)}`, '_blank')
      completeTask.mutate(task.id)
      toast.success('SMS ouvert avec le message')
    } else if (task.channel === 'call') {
      window.open(`tel:${phone}`, '_blank')
      toast('Appel lance — marquez la tache quand termine')
    } else if (task.channel === 'email') {
      const subject = encodeURIComponent(task.title)
      const body = encodeURIComponent(message)
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank')
      completeTask.mutate(task.id)
    } else {
      completeTask.mutate(task.id)
    }

    // Log in history
    await supabase.from('history').insert({
      tenant_id: task.tenant_id, client_id: task.client_id, agent_id: userId,
      type: task.channel === 'whatsapp' ? 'whatsapp_message' : task.channel === 'sms' ? 'sms' : task.channel === 'call' ? 'call' : 'note',
      title: `Tache executee: ${task.title}`,
    } as never)
    await supabase.from('clients').update({ last_contact_at: new Date().toISOString() } as never).eq('id', task.client_id)
  }

  // Filter tasks
  const filtered = useMemo(() => {
    let tasks = allTasks

    if (agentFilter !== 'all') tasks = tasks.filter(t => t.agent_id === agentFilter)
    if (stageFilter !== 'all') tasks = tasks.filter(t => t.stage === stageFilter)

    const now = new Date()
    // Helpers — display-status driven so we don't depend on the
    // post-028 collapsed enum ('pending' covers pending+scheduled+in_progress).
    const isActive = (t: ClientTask) => {
      const d = deriveDisplayStatus(t)
      return d === 'pending' || d === 'scheduled' || d === 'in_progress'
    }
    const isTerminal = (t: ClientTask) => {
      const d = deriveDisplayStatus(t)
      return d === 'completed' || d === 'skipped' || d === 'cancelled'
    }

    switch (tab) {
      case 'today':
        return tasks.filter(t => isActive(t) && (!t.scheduled_at || isToday(new Date(t.scheduled_at)) || new Date(t.scheduled_at) <= now))
      case 'overdue':
        return tasks.filter(t => isActive(t) && t.scheduled_at && new Date(t.scheduled_at) < now)
      case 'upcoming':
        return tasks.filter(t => isActive(t) && t.scheduled_at && new Date(t.scheduled_at) > now)
      case 'completed':
        return tasks.filter(t => isTerminal(t))
      default:
        return tasks
    }
  }, [allTasks, tab, agentFilter, stageFilter])

  // KPIs (same isActive/isTerminal predicates inlined to keep useMemo simple)
  const isActiveTask = (t: ClientTask) => {
    const d = deriveDisplayStatus(t)
    return d === 'pending' || d === 'scheduled' || d === 'in_progress'
  }
  const todayCount = allTasks.filter(t => isActiveTask(t) && (!t.scheduled_at || isToday(new Date(t.scheduled_at)) || new Date(t.scheduled_at) <= new Date())).length
  const overdueCount = allTasks.filter(t => isActiveTask(t) && t.scheduled_at && new Date(t.scheduled_at) < new Date()).length
  const upcomingCount = allTasks.filter(t => isActiveTask(t) && t.scheduled_at && new Date(t.scheduled_at) > new Date()).length
  const completedCount = allTasks.filter(t => deriveDisplayStatus(t) === 'completed').length
  const totalActive = allTasks.filter(t => isActiveTask(t)).length
  const progress = totalActive + completedCount > 0 ? Math.round((completedCount / (totalActive + completedCount)) * 100) : 0

  if (isLoading) return <PageSkeleton kpiCount={4} />

  const TABS: Array<{ key: TabKey; label: string; count: number; icon: typeof Clock }> = [
    { key: 'today', label: t('tasks_page.tab_today'), count: todayCount, icon: Calendar },
    { key: 'overdue', label: t('tasks_page.tab_overdue'), count: overdueCount, icon: AlertTriangle },
    { key: 'upcoming', label: t('tasks_page.tab_upcoming'), count: upcomingCount, icon: Clock },
    { key: 'completed', label: t('tasks_page.tab_completed'), count: completedCount, icon: CheckCircle },
    { key: 'messages', label: t('tasks_page.tab_messages'), count: 0, icon: FileText },
    { key: 'config', label: t('tasks_page.tab_config'), count: 0, icon: Settings },
  ]

  const agentOptions = [{ value: 'all', label: t('tasks_page.all_agents') }, ...agents.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]
  const stageOptions = [{ value: 'all', label: t('tasks_page.all_stages') }, ...Object.entries(PIPELINE_STAGES).map(([k, v]) => ({ value: k, label: v.label }))]

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPICard label={t('tasks_page.kpi_today')} value={todayCount} accent={todayCount > 0 ? 'orange' : 'green'} icon={<Calendar className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label={t('tasks_page.kpi_overdue')} value={overdueCount} accent={overdueCount > 0 ? 'red' : 'green'} icon={<AlertTriangle className="h-4 w-4 text-immo-status-red" />} />
        <KPICard label={t('tasks_page.kpi_upcoming')} value={upcomingCount} accent="blue" icon={<Clock className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label={t('tasks_page.kpi_completed')} value={completedCount} accent="green" icon={<CheckCircle className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label={t('tasks_page.kpi_progress')} value={`${progress}%`} accent="green" icon={<Zap className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      {/* Tabs */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto border-b border-immo-border-default">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors sm:px-4 ${tab === t.key ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count > 0 && t.key !== 'config' && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${t.key === 'overdue' ? 'bg-immo-status-red/10 text-immo-status-red' : 'bg-immo-accent-green/10 text-immo-accent-green'}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {!['config', 'messages'].includes(tab) && (
          <div className="flex flex-wrap gap-2">
            {!isAgent && <FilterDropdown label="Agent" options={agentOptions} value={agentFilter} onChange={setAgentFilter} />}
            <FilterDropdown label="Etape" options={stageOptions} value={stageFilter} onChange={setStageFilter} />
          </div>
        )}
      </div>

      {/* Config tab */}
      {tab === 'config' && <TaskConfigSection />}

      {/* Messages tab */}
      {tab === 'messages' && <MessagesTemplateTab tenantId={tenantId!} />}

      {/* Task list */}
      {!['config', 'messages'].includes(tab) && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <CheckCircle className="mx-auto mb-3 h-10 w-10 text-immo-accent-green/30" />
              <p className="text-sm text-immo-text-muted">
                {tab === 'today' ? t('tasks_page.empty_today') :
                 tab === 'overdue' ? t('tasks_page.empty_overdue') :
                 tab === 'upcoming' ? t('tasks_page.empty_upcoming') :
                 t('tasks_page.empty_completed')}
              </p>
            </div>
          )}

          {filtered.map(task => {
            const display = deriveDisplayStatus(task)
            const meta = DISPLAY_STATUS_META[display]
            const ChannelIcon = CHANNEL_ICONS[task.channel] ?? Zap
            const isActionable = display === 'pending' || display === 'scheduled' || display === 'in_progress'
            const isCompleted = display === 'completed'
            const isOverdue = task.scheduled_at && new Date(task.scheduled_at) < new Date() && isActionable
            const stageInfo = PIPELINE_STAGES[task.stage as keyof typeof PIPELINE_STAGES]

            return (
              <div key={task.id}
                className={`flex items-center gap-3 rounded-xl border p-3.5 transition-all ${
                  isCompleted ? 'border-immo-accent-green/20 bg-immo-accent-green/[0.02] opacity-50' :
                  isOverdue ? 'border-immo-status-red/30 bg-immo-status-red/[0.02]' :
                  'border-immo-border-default bg-immo-bg-card hover:border-immo-accent-green/30 hover:shadow-sm'
                }`}>
                {/* Checkbox */}
                <button onClick={() => isActionable ? completeTask.mutate(task.id) : null}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isCompleted ? 'border-immo-accent-green bg-immo-accent-green text-white' :
                    'border-immo-border-default hover:border-immo-accent-green'
                  }`}>
                  {isCompleted && <CheckCircle className="h-3 w-3" />}
                </button>

                {/* Channel */}
                <ChannelIcon className={`h-4 w-4 shrink-0 ${
                  task.channel === 'whatsapp' ? 'text-[#25D366]' :
                  task.channel === 'call' ? 'text-immo-accent-blue' :
                  task.channel === 'sms' ? 'text-immo-status-orange' :
                  'text-immo-text-muted'
                }`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${isCompleted ? 'text-immo-text-muted line-through' : 'text-immo-text-primary'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* Client name */}
                    {task.client && (
                      <button onClick={() => navigate(`/pipeline/clients/${task.client_id}?tab=auto_tasks`)}
                        className="text-[10px] font-medium text-immo-accent-blue hover:underline">
                        {task.client.full_name}
                      </button>
                    )}
                    {/* Stage badge */}
                    {stageInfo && (
                      <span className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold" style={{ backgroundColor: stageInfo.color + '15', color: stageInfo.color }}>
                        {stageInfo.label}
                      </span>
                    )}
                    {/* Agent */}
                    {task.agent && !isAgent && (
                      <span className="text-[10px] text-immo-text-muted">{task.agent.first_name} {task.agent.last_name}</span>
                    )}
                    {/* Time */}
                    {task.scheduled_at && isActionable && (
                      <span className={`text-[9px] flex items-center gap-0.5 ${isOverdue ? 'text-immo-status-red font-medium' : 'text-immo-text-muted'}`}>
                        <Clock className="h-2.5 w-2.5" />
                        {isOverdue ? 'En retard — ' : ''}
                        {isToday(new Date(task.scheduled_at)) ? format(new Date(task.scheduled_at), 'HH:mm') :
                         isTomorrow(new Date(task.scheduled_at)) ? 'Demain' :
                         formatDistanceToNow(new Date(task.scheduled_at), { addSuffix: true, locale: fr })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Priority */}
                {(task.priority === 'high' || task.priority === 'urgent') && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-immo-status-orange" />}

                {/* Status */}
                <StatusBadge label={meta.label} type={meta.color} />

                {/* Actions */}
                {isActionable && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setDetailTask(task)} title="Apercu"
                      className="rounded-lg border border-immo-border-default px-2.5 py-1.5 text-[10px] font-medium text-immo-text-secondary hover:bg-immo-bg-card-hover transition-colors">
                      Apercu
                    </button>
                    {task.channel === 'whatsapp' && (
                      <button onClick={() => executeTask(task)} title="Ouvrir WhatsApp avec message"
                        className="flex items-center gap-1 rounded-lg bg-[#25D366]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#25D366] hover:bg-[#25D366]/20 transition-colors">
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </button>
                    )}
                    {task.channel === 'sms' && (
                      <button onClick={() => executeTask(task)} title="Ouvrir SMS avec message"
                        className="flex items-center gap-1 rounded-lg bg-immo-status-orange/10 px-2.5 py-1.5 text-[10px] font-semibold text-immo-status-orange hover:bg-immo-status-orange/20 transition-colors">
                        <Mail className="h-3 w-3" /> SMS
                      </button>
                    )}
                    {task.channel === 'call' && (
                      <button onClick={() => setCallTask(task)} title="Démarrer l'appel — ouvre le script + notes en plein écran"
                        className="flex items-center gap-1 rounded-lg bg-immo-accent-blue/10 px-2.5 py-1.5 text-[10px] font-semibold text-immo-accent-blue hover:bg-immo-accent-blue/20 transition-colors">
                        <Phone className="h-3 w-3" /> Appeler
                      </button>
                    )}
                    {task.channel === 'email' && (
                      <button onClick={() => executeTask(task)} title="Ouvrir email"
                        className="flex items-center gap-1 rounded-lg bg-immo-accent-blue/10 px-2.5 py-1.5 text-[10px] font-semibold text-immo-accent-blue hover:bg-immo-accent-blue/20 transition-colors">
                        <Mail className="h-3 w-3" /> Email
                      </button>
                    )}
                    {task.channel === 'system' && (
                      <button onClick={() => completeTask.mutate(task.id)} title="Marquer fait"
                        className="flex items-center gap-1 rounded-lg bg-immo-bg-card-hover px-2.5 py-1.5 text-[10px] font-semibold text-immo-text-muted hover:text-immo-accent-green transition-colors">
                        <CheckCircle className="h-3 w-3" /> Fait
                      </button>
                    )}
                    <button onClick={() => skipTask.mutate(task.id)} aria-label="Ignorer la tache" title="Ignorer"
                      className="rounded-lg p-1.5 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0579DA]/40">
                      <SkipForward className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {/* Task detail modal */}
      {detailTask && (
        <TaskDetailModal task={detailTask} isOpen={!!detailTask} onClose={() => setDetailTask(null)} />
      )}
      {/* Full-screen Mode Appel — opens directly from the inline
          "Appeler" button on the task list so the agent doesn't have
          to go through the detail modal first. */}
      {callTask && (
        <CallModeOverlay
          isOpen={!!callTask}
          onClose={() => setCallTask(null)}
          task={callTask}
        />
      )}
    </div>
  )
}

