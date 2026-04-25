import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Clock, Send, Phone, MessageCircle, Mail, AlertTriangle, Zap, SkipForward } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common'
// import { PIPELINE_STAGES } from '@/types'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { deriveDisplayStatus, DISPLAY_STATUS_META, buildStatusPayload } from '@/lib/taskStatus'

interface ClientTask {
  id: string; title: string; description: string | null; stage: string
  status: string; priority: string; channel: string; scheduled_at: string | null
  executed_at: string | null; completed_at: string | null; message_sent: string | null
  template_id: string | null; bundle_id: string | null
  auto_cancelled: boolean | null
  created_at: string
}

interface TaskTemplate {
  id: string; title: string; stage: string; channel: string; message_mode: string
  delay_minutes: number; attached_file_types: string[]
}

const CHANNEL_ICONS: Record<string, typeof Phone> = { whatsapp: MessageCircle, sms: Mail, call: Phone, email: Mail, system: Zap }

interface Props {
  clientId: string
  clientName: string
  clientPhone: string
  clientStage: string
  tenantId: string
}

export function ClientTasksTab({ clientId, clientName, clientPhone, clientStage, tenantId }: Props) {
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending')

  // Client tasks (post-028 unified — reads from `tasks`)
  const { data: tasks = [] } = useQuery({
    queryKey: ['client-tasks', clientId],
    queryFn: async () => {
      const { data } = await supabase.from('tasks').select('*').eq('client_id', clientId).is('deleted_at', null).order('created_at')
      return (data ?? []) as unknown as ClientTask[]
    },
  })

  // Generate tasks from templates if none exist
  const generateTasks = useMutation({
    mutationFn: async () => {
      // Fetch active templates for current stage
      const { data: templates } = await supabase.from('task_templates').select('*')
        .eq('tenant_id', tenantId).eq('stage', clientStage).eq('is_active', true).order('sort_order')

      if (!templates || templates.length === 0) { toast.error('Aucun template actif pour cette étape'); return }

      // Status is always 'pending' (enum); UI derives "Programmé" from
      // scheduled_at > now() when delay_minutes > 0.
      const newTasks = (templates as TaskTemplate[]).map(t => ({
        tenant_id: tenantId,
        client_id: clientId,
        template_id: t.id,
        title: t.title,
        stage: t.stage,
        type: 'manual' as const,
        status: 'pending' as const,
        priority: 'medium',
        channel: t.channel,
        agent_id: userId,
        scheduled_at: t.delay_minutes > 0 ? new Date(Date.now() + t.delay_minutes * 60000).toISOString() : null,
      }))

      const { error } = await supabase.from('tasks').insert(newTasks)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client-tasks', clientId] }); toast.success('Tâches générées') },
  })

  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').update(buildStatusPayload('completed')).eq('id', taskId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['client-tasks', clientId] }); toast.success('Tâche terminée') },
  })

  const skipTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').update(buildStatusPayload('skipped')).eq('id', taskId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-tasks', clientId] }),
  })

  // Execute task: open WhatsApp / SMS with pre-written message
  function executeTask(task: ClientTask) {
    const cleanPhone = clientPhone.replace(/\s+/g, '').replace(/^0/, '213')

    if (task.channel === 'whatsapp') {
      const msg = task.message_sent || `Bonjour ${clientName.split(' ')[0]}`
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank')
      completeTask.mutate(task.id)
    } else if (task.channel === 'sms') {
      window.open(`sms:${clientPhone}?body=${encodeURIComponent(task.message_sent || '')}`, '_blank')
      completeTask.mutate(task.id)
    } else if (task.channel === 'call') {
      window.open(`tel:${clientPhone}`, '_blank')
      // Don't auto-complete call tasks - agent decides after
    } else {
      completeTask.mutate(task.id)
    }

    // Log in history
    supabase.from('history').insert({
      tenant_id: tenantId, client_id: clientId, agent_id: userId,
      type: task.channel === 'whatsapp' ? 'whatsapp_message' : task.channel === 'sms' ? 'sms' : task.channel === 'call' ? 'call' : 'note',
      title: `Tache executee: ${task.title}`,
    } as never)
  }

  const filtered = tasks.filter(t => {
    const display = deriveDisplayStatus(t)
    if (filter === 'all') return true
    if (filter === 'pending') return display === 'pending' || display === 'scheduled' || display === 'in_progress'
    return display === 'completed' || display === 'skipped' || display === 'cancelled'
  })

  const pendingCount = tasks.filter(t => {
    const d = deriveDisplayStatus(t)
    return d === 'pending' || d === 'scheduled' || d === 'in_progress'
  }).length
  const completedCount = tasks.filter(t => t.status === 'completed').length
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-immo-text-primary">Taches ({pendingCount} en attente)</h3>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-24 rounded-full bg-immo-border-default">
              <div className="h-full rounded-full bg-immo-accent-green transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-[10px] text-immo-text-muted">{progress}%</span>
          </div>
        </div>
        <div className="flex gap-2">
          {tasks.length === 0 && (
            <Button onClick={() => generateTasks.mutate()} disabled={generateTasks.isPending}
              className="h-7 bg-immo-accent-green text-[10px] text-white">
              <Zap className="mr-1 h-3 w-3" /> Generer les taches
            </Button>
          )}
          <div className="flex rounded-lg border border-immo-border-default p-0.5">
            {(['pending', 'completed', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium ${filter === f ? 'bg-immo-accent-green/10 text-immo-accent-green' : 'text-immo-text-muted'}`}>
                {f === 'pending' ? 'A faire' : f === 'completed' ? 'Terminees' : 'Toutes'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tasks list */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCircle className="mx-auto mb-2 h-8 w-8 text-immo-accent-green/30" />
          <p className="text-sm text-immo-text-muted">
            {tasks.length === 0 ? 'Aucune tache. Cliquez "Generer" pour creer les taches de cette etape.' : 'Toutes les taches sont terminees !'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const display = deriveDisplayStatus(task)
            const meta = DISPLAY_STATUS_META[display]
            const ChannelIcon = CHANNEL_ICONS[task.channel] ?? Zap
            const isActionable = display === 'pending' || display === 'scheduled' || display === 'in_progress'
            const isCompleted = display === 'completed'
            const isOverdue = task.scheduled_at && new Date(task.scheduled_at) < new Date() && isActionable

            return (
              <div key={task.id}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                  isCompleted ? 'border-immo-accent-green/20 bg-immo-accent-green/5 opacity-60' :
                  isOverdue ? 'border-immo-status-red/30 bg-immo-status-red/5' :
                  'border-immo-border-default hover:border-immo-accent-green/30'
                }`}>
                {/* Status checkbox */}
                <button onClick={() => isActionable ? completeTask.mutate(task.id) : null}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    isCompleted ? 'border-immo-accent-green bg-immo-accent-green text-white' :
                    'border-immo-border-default hover:border-immo-accent-green'
                  }`}>
                  {isCompleted && <CheckCircle className="h-3 w-3" />}
                </button>

                {/* Channel icon */}
                <ChannelIcon className={`h-4 w-4 shrink-0 ${
                  task.channel === 'whatsapp' ? 'text-[#25D366]' :
                  task.channel === 'call' ? 'text-immo-accent-blue' :
                  'text-immo-text-muted'
                }`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${isCompleted ? 'text-immo-text-muted line-through' : 'text-immo-text-primary'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.scheduled_at && isActionable && (
                      <span className={`text-[9px] flex items-center gap-0.5 ${isOverdue ? 'text-immo-status-red font-medium' : 'text-immo-text-muted'}`}>
                        <Clock className="h-2.5 w-2.5" />
                        {isOverdue ? 'En retard — ' : ''}{formatDistanceToNow(new Date(task.scheduled_at), { addSuffix: true, locale: fr })}
                      </span>
                    )}
                    {task.completed_at && (
                      <span className="text-[9px] text-immo-text-muted">Fait {formatDistanceToNow(new Date(task.completed_at), { addSuffix: true, locale: fr })}</span>
                    )}
                  </div>
                </div>

                {/* Priority */}
                {task.priority === 'high' || task.priority === 'urgent' ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-immo-status-orange" />
                ) : null}

                {/* Status badge */}
                <StatusBadge label={meta.label} type={meta.color} />

                {/* Actions */}
                {isActionable && (
                  <div className="flex gap-1 shrink-0">
                    {task.channel !== 'system' && (
                      <button onClick={() => executeTask(task)} aria-label="Executer la tache" title="Executer"
                        className="flex items-center gap-1 rounded-md bg-immo-accent-green/10 px-2 py-1 text-[10px] font-medium text-immo-accent-green transition-colors hover:bg-immo-accent-green/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40">
                        <Send className="h-3 w-3" /> Executer
                      </button>
                    )}
                    <button onClick={() => skipTask.mutate(task.id)} aria-label="Ignorer la tache" title="Ignorer"
                      className="rounded-md p-1 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40">
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
