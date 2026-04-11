import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle, Clock, Send, Phone, MessageCircle, Mail, AlertTriangle,
  Zap, SkipForward, Calendar, Settings,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { KPICard, FilterDropdown, LoadingSpinner, StatusBadge } from '@/components/common'
import { PIPELINE_STAGES } from '@/types'
import { formatDistanceToNow, isToday, isTomorrow, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { TaskConfigSection } from '@/pages/settings/sections/TaskConfigSection'

interface ClientTask {
  id: string; title: string; stage: string; status: string; priority: string
  channel: string; scheduled_at: string | null; completed_at: string | null
  created_at: string; client_id: string; agent_id: string | null; tenant_id: string
  client?: { full_name: string; phone: string; pipeline_stage: string } | null
  agent?: { first_name: string; last_name: string } | null
}

type TabKey = 'today' | 'overdue' | 'upcoming' | 'completed' | 'config'

const STATUS_MAP: Record<string, { label: string; type: 'green' | 'orange' | 'blue' | 'muted' | 'red' }> = {
  pending: { label: 'A faire', type: 'orange' },
  scheduled: { label: 'Programme', type: 'blue' },
  in_progress: { label: 'En cours', type: 'blue' },
  completed: { label: 'Fait', type: 'green' },
  skipped: { label: 'Ignore', type: 'muted' },
  cancelled: { label: 'Annule', type: 'red' },
}

const CHANNEL_ICONS: Record<string, typeof Phone> = { whatsapp: MessageCircle, sms: Mail, call: Phone, email: Mail, system: Zap }

export function TasksPage() {
  const navigate = useNavigate()
  const { tenantId } = useAuthStore()
  const userId = useAuthStore(s => s.session?.user?.id)
  const { isAgent } = usePermissions()
  const qc = useQueryClient()

  const [tab, setTab] = useState<TabKey>('today')
  const [agentFilter, setAgentFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState('all')

  // Fetch all tasks with client + agent relations
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['all-tasks', tenantId],
    queryFn: async () => {
      let query = supabase.from('client_tasks')
        .select('*, clients(full_name, phone, pipeline_stage), users!client_tasks_agent_id_fkey(first_name, last_name)')
        .eq('tenant_id', tenantId!)
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
      const { error } = await supabase.from('client_tasks').update({ status: 'completed', completed_at: new Date().toISOString(), executed_at: new Date().toISOString() } as never).eq('id', taskId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-tasks'] }); toast.success('Tache terminee') },
  })

  const skipTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('client_tasks').update({ status: 'skipped' } as never).eq('id', taskId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-tasks'] }),
  })

  function executeTask(task: ClientTask) {
    const phone = task.client?.phone ?? ''
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^0/, '213')
    const name = task.client?.full_name?.split(' ')[0] ?? ''

    if (task.channel === 'whatsapp') {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Bonjour ${name}`)}`, '_blank')
      completeTask.mutate(task.id)
    } else if (task.channel === 'sms') {
      window.open(`sms:${phone}`, '_blank')
      completeTask.mutate(task.id)
    } else if (task.channel === 'call') {
      window.open(`tel:${phone}`, '_blank')
    } else {
      completeTask.mutate(task.id)
    }
  }

  // Filter tasks
  const filtered = useMemo(() => {
    let tasks = allTasks

    if (agentFilter !== 'all') tasks = tasks.filter(t => t.agent_id === agentFilter)
    if (stageFilter !== 'all') tasks = tasks.filter(t => t.stage === stageFilter)

    const now = new Date()
    switch (tab) {
      case 'today':
        return tasks.filter(t => ['pending', 'scheduled'].includes(t.status) && (!t.scheduled_at || isToday(new Date(t.scheduled_at)) || new Date(t.scheduled_at) <= now))
      case 'overdue':
        return tasks.filter(t => ['pending', 'scheduled'].includes(t.status) && t.scheduled_at && new Date(t.scheduled_at) < now)
      case 'upcoming':
        return tasks.filter(t => ['pending', 'scheduled'].includes(t.status) && t.scheduled_at && new Date(t.scheduled_at) > now)
      case 'completed':
        return tasks.filter(t => ['completed', 'skipped'].includes(t.status))
      default:
        return tasks
    }
  }, [allTasks, tab, agentFilter, stageFilter])

  // KPIs
  const todayCount = allTasks.filter(t => ['pending', 'scheduled'].includes(t.status) && (!t.scheduled_at || isToday(new Date(t.scheduled_at)) || new Date(t.scheduled_at) <= new Date())).length
  const overdueCount = allTasks.filter(t => ['pending', 'scheduled'].includes(t.status) && t.scheduled_at && new Date(t.scheduled_at) < new Date()).length
  const upcomingCount = allTasks.filter(t => ['pending', 'scheduled'].includes(t.status) && t.scheduled_at && new Date(t.scheduled_at) > new Date()).length
  const completedCount = allTasks.filter(t => t.status === 'completed').length
  const totalActive = allTasks.filter(t => !['completed', 'skipped', 'cancelled'].includes(t.status)).length
  const progress = totalActive + completedCount > 0 ? Math.round((completedCount / (totalActive + completedCount)) * 100) : 0

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  const TABS: Array<{ key: TabKey; label: string; count: number; icon: typeof Clock }> = [
    { key: 'today', label: 'Aujourd\'hui', count: todayCount, icon: Calendar },
    { key: 'overdue', label: 'En retard', count: overdueCount, icon: AlertTriangle },
    { key: 'upcoming', label: 'A venir', count: upcomingCount, icon: Clock },
    { key: 'completed', label: 'Terminees', count: completedCount, icon: CheckCircle },
    { key: 'config', label: 'Configuration', count: 0, icon: Settings },
  ]

  const agentOptions = [{ value: 'all', label: 'Tous les agents' }, ...agents.map(a => ({ value: a.id, label: `${a.first_name} ${a.last_name}` }))]
  const stageOptions = [{ value: 'all', label: 'Toutes les etapes' }, ...Object.entries(PIPELINE_STAGES).map(([k, v]) => ({ value: k, label: v.label }))]

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPICard label="A faire aujourd'hui" value={todayCount} accent={todayCount > 0 ? 'orange' : 'green'} icon={<Calendar className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label="En retard" value={overdueCount} accent={overdueCount > 0 ? 'red' : 'green'} icon={<AlertTriangle className="h-4 w-4 text-immo-status-red" />} />
        <KPICard label="A venir" value={upcomingCount} accent="blue" icon={<Clock className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Terminees" value={completedCount} accent="green" icon={<CheckCircle className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="Progression" value={`${progress}%`} accent="green" icon={<Zap className="h-4 w-4 text-immo-accent-green" />} />
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-immo-border-default">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${tab === t.key ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.count > 0 && t.key !== 'config' && (
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${t.key === 'overdue' ? 'bg-immo-status-red/10 text-immo-status-red' : 'bg-immo-accent-green/10 text-immo-accent-green'}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {tab !== 'config' && (
          <div className="flex gap-2">
            {!isAgent && <FilterDropdown label="Agent" options={agentOptions} value={agentFilter} onChange={setAgentFilter} />}
            <FilterDropdown label="Etape" options={stageOptions} value={stageFilter} onChange={setStageFilter} />
          </div>
        )}
      </div>

      {/* Config tab */}
      {tab === 'config' && <TaskConfigSection />}

      {/* Task list */}
      {tab !== 'config' && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <CheckCircle className="mx-auto mb-3 h-10 w-10 text-immo-accent-green/30" />
              <p className="text-sm text-immo-text-muted">
                {tab === 'today' ? 'Aucune tache pour aujourd\'hui' :
                 tab === 'overdue' ? 'Aucune tache en retard' :
                 tab === 'upcoming' ? 'Aucune tache programmee' :
                 'Aucune tache terminee'}
              </p>
            </div>
          )}

          {filtered.map(task => {
            const st = STATUS_MAP[task.status] ?? STATUS_MAP.pending
            const ChannelIcon = CHANNEL_ICONS[task.channel] ?? Zap
            const isPending = ['pending', 'scheduled'].includes(task.status)
            const isOverdue = task.scheduled_at && new Date(task.scheduled_at) < new Date() && isPending
            const stageInfo = PIPELINE_STAGES[task.stage as keyof typeof PIPELINE_STAGES]

            return (
              <div key={task.id}
                className={`flex items-center gap-3 rounded-xl border p-3.5 transition-all ${
                  task.status === 'completed' ? 'border-immo-accent-green/20 bg-immo-accent-green/[0.02] opacity-50' :
                  isOverdue ? 'border-immo-status-red/30 bg-immo-status-red/[0.02]' :
                  'border-immo-border-default bg-immo-bg-card hover:border-immo-accent-green/30 hover:shadow-sm'
                }`}>
                {/* Checkbox */}
                <button onClick={() => isPending ? completeTask.mutate(task.id) : null}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    task.status === 'completed' ? 'border-immo-accent-green bg-immo-accent-green text-white' :
                    'border-immo-border-default hover:border-immo-accent-green'
                  }`}>
                  {task.status === 'completed' && <CheckCircle className="h-3 w-3" />}
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
                  <p className={`text-sm ${task.status === 'completed' ? 'text-immo-text-muted line-through' : 'text-immo-text-primary'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* Client name */}
                    {task.client && (
                      <button onClick={() => navigate(`/pipeline/clients/${task.client_id}`)}
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
                    {task.scheduled_at && isPending && (
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
                <StatusBadge label={st.label} type={st.type} />

                {/* Actions */}
                {isPending && (
                  <div className="flex gap-1 shrink-0">
                    {task.channel !== 'system' && (
                      <button onClick={() => executeTask(task)} title="Executer"
                        className="flex items-center gap-1 rounded-lg bg-immo-accent-green/10 px-2.5 py-1.5 text-[10px] font-semibold text-immo-accent-green hover:bg-immo-accent-green/20 transition-colors">
                        <Send className="h-3 w-3" /> Executer
                      </button>
                    )}
                    <button onClick={() => skipTask.mutate(task.id)} title="Ignorer"
                      className="rounded-lg p-1.5 text-immo-text-muted hover:bg-immo-bg-card-hover">
                      <SkipForward className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
