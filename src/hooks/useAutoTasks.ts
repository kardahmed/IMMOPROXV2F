import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

interface TaskTemplate {
  id: string; title: string; stage: string; channel: string
  delay_minutes: number; priority: string; bundle_id: string | null
}

/**
 * Hook to auto-generate tasks when a client changes pipeline stage.
 * Also cancels pending tasks from the previous stage.
 *
 * Post-028 unified model: writes to `tasks` (not `client_tasks`).
 * Status uses the 3-value enum + auto_cancelled boolean for the
 * cancelled-by-system distinction.
 */
export function useAutoTasks() {
  const tenantId = useAuthStore(s => s.tenantId)
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()

  const generateForStage = useMutation({
    mutationFn: async ({ clientId, newStage, oldStage }: { clientId: string; newStage: string; oldStage?: string }) => {
      if (!tenantId || !userId) return

      // 1. Cancel pending tasks from old stage (status=ignored + auto_cancelled flag)
      if (oldStage && oldStage !== newStage) {
        await supabase.from('tasks')
          .update({ status: 'ignored', auto_cancelled: true })
          .eq('client_id', clientId)
          .eq('stage', oldStage)
          .eq('status', 'pending')
      }

      // 2. Skip generation only when there are still ACTIVELY PENDING
      //    tasks for this stage. The previous filter
      //    `.or('status.neq.ignored,auto_cancelled.eq.false')` matched
      //    almost everything — including completed (`status='done'`)
      //    tasks — so a client re-entering a stage they'd already
      //    cleared got NO fresh tasks. Now we only block on the
      //    `pending` status; done/ignored tasks don't block re-entry.
      const { count } = await supabase.from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('stage', newStage)
        .eq('status', 'pending')

      if ((count ?? 0) > 0) return // Stage already has live tasks

      // 3. Fetch active templates for new stage
      const { data: templates } = await supabase.from('task_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('stage', newStage)
        .eq('is_active', true)
        .order('sort_order')

      if (!templates || templates.length === 0) return

      // 4. Create tasks — status is always 'pending'; the UI derives
      // "Programmé" from scheduled_at > now() when delay_minutes > 0.
      const newTasks = (templates as TaskTemplate[]).map(t => ({
        tenant_id: tenantId,
        client_id: clientId,
        template_id: t.id,
        bundle_id: t.bundle_id,
        title: t.title,
        stage: t.stage,
        type: 'manual' as const,
        status: 'pending' as const,
        priority: t.priority,
        channel: t.channel,
        agent_id: userId,
        scheduled_at: t.delay_minutes > 0 ? new Date(Date.now() + t.delay_minutes * 60000).toISOString() : null,
      }))

      await supabase.from('tasks').insert(newTasks)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['all-tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  return { generateForStage }
}
