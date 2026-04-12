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
 */
export function useAutoTasks() {
  const tenantId = useAuthStore(s => s.tenantId)
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()

  const generateForStage = useMutation({
    mutationFn: async ({ clientId, newStage, oldStage }: { clientId: string; newStage: string; oldStage?: string }) => {
      if (!tenantId || !userId) return

      // 1. Cancel pending tasks from old stage
      if (oldStage && oldStage !== newStage) {
        await supabase.from('client_tasks')
          .update({ status: 'cancelled', auto_cancelled: true } as never)
          .eq('client_id', clientId)
          .eq('stage', oldStage)
          .in('status', ['pending', 'scheduled'])
      }

      // 2. Check if tasks already exist for new stage
      const { count } = await supabase.from('client_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('stage', newStage)
        .not('status', 'eq', 'cancelled')

      if ((count ?? 0) > 0) return // Already has tasks for this stage

      // 3. Fetch active templates for new stage
      const { data: templates } = await supabase.from('task_templates')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('stage', newStage)
        .eq('is_active', true)
        .order('sort_order')

      if (!templates || templates.length === 0) return

      // 4. Create tasks
      const newTasks = (templates as TaskTemplate[]).map(t => ({
        tenant_id: tenantId,
        client_id: clientId,
        template_id: t.id,
        bundle_id: t.bundle_id,
        title: t.title,
        stage: t.stage,
        status: t.delay_minutes === 0 ? 'pending' as const : 'scheduled' as const,
        priority: t.priority,
        channel: t.channel,
        agent_id: userId,
        scheduled_at: t.delay_minutes > 0 ? new Date(Date.now() + t.delay_minutes * 60000).toISOString() : null,
      }))

      await supabase.from('client_tasks').insert(newTasks as never)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-tasks'] })
      qc.invalidateQueries({ queryKey: ['all-tasks'] })
    },
  })

  return { generateForStage }
}
