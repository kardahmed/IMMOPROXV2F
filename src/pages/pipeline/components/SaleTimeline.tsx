import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'
import { PIPELINE_ORDER } from '@/lib/constants'
import { format } from 'date-fns'

interface SaleTimelineProps {
  clientId: string
  currentStage: PipelineStage
}

export function SaleTimeline({ clientId, currentStage }: SaleTimelineProps) {
  const { data: stageHistory = [] } = useQuery({
    queryKey: ['client-stage-history', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('history')
        .select('created_at, metadata')
        .eq('client_id', clientId)
        .eq('type', 'stage_change')
        .order('created_at', { ascending: true })
      return (data ?? []) as Array<{ created_at: string; metadata: { to?: string; from?: string } | null }>
    },
  })

  // Build a map: stage → date reached
  const stageDates = new Map<string, string>()
  for (const entry of stageHistory) {
    const to = entry.metadata?.to
    if (to && !stageDates.has(to)) {
      stageDates.set(to, entry.created_at)
    }
  }

  const currentIdx = PIPELINE_ORDER.indexOf(currentStage)

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {PIPELINE_ORDER.map((stage, i) => {
        const meta = PIPELINE_STAGES[stage]
        const date = stageDates.get(stage)
        const isPast = i < currentIdx
        const isCurrent = i === currentIdx

        return (
          <div key={stage} className="flex items-center">
            {i > 0 && (
              <div className={`h-0.5 w-6 ${isPast || isCurrent ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`} />
            )}
            <div className="flex flex-col items-center">
              {/* Dot */}
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold transition-all ${
                isCurrent
                  ? 'ring-2 ring-immo-accent-green/30'
                  : ''
              }`} style={{
                backgroundColor: isPast || isCurrent ? meta.color + '20' : '#F0F4F8',
                color: isPast || isCurrent ? meta.color : '#8898AA',
              }}>
                {isPast ? '✓' : i + 1}
              </div>
              {/* Label */}
              <span className={`mt-1 whitespace-nowrap text-[9px] ${
                isCurrent ? 'font-semibold text-immo-text-primary' : 'text-immo-text-muted'
              }`}>
                {meta.label}
              </span>
              {/* Date */}
              {date && (
                <span className="text-[8px] text-immo-text-muted">
                  {format(new Date(date), 'dd/MM')}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
