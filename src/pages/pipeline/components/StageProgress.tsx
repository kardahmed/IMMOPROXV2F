import { PIPELINE_STAGES } from '@/types'
import type { StageStat } from '@/hooks/usePipelineStats'

interface StageProgressProps {
  stats: StageStat[]
}

export function StageProgress({ stats }: StageProgressProps) {
  const maxCount = Math.max(...stats.map(s => s.count), 1)

  return (
    <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
      <h3 className="mb-4 text-sm font-semibold text-immo-text-primary">
        Répartition par étape
      </h3>
      <div className="space-y-2.5">
        {stats.map((s) => {
          const meta = PIPELINE_STAGES[s.stage]
          return (
            <div key={s.stage} className="flex items-center gap-3">
              <div className="w-[130px] shrink-0">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                  <span className="truncate text-xs text-immo-text-secondary">{meta.label}</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="h-2 overflow-hidden rounded-full bg-immo-bg-primary">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(s.count / maxCount) * 100}%`, background: meta.color }}
                  />
                </div>
              </div>
              <div className="w-[70px] shrink-0 text-end">
                <span className="text-xs font-semibold text-immo-text-primary">{s.count}</span>
                <span className="ms-1 text-[10px] text-immo-text-muted">({s.percentage.toFixed(0)}%)</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
