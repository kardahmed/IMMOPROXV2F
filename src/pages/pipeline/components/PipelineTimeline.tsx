import { Check, RotateCcw, XCircle } from 'lucide-react'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'

// Only the progression stages (not relancement/perdue which are end states)
const PROGRESSION_STAGES: PipelineStage[] = [
  'accueil', 'visite_a_gerer', 'visite_confirmee', 'visite_terminee',
  'negociation', 'reservation', 'vente',
]

const END_STAGES: PipelineStage[] = ['relancement', 'perdue']

interface PipelineTimelineProps {
  currentStage: PipelineStage
  onStageClick: (stage: PipelineStage) => void
}

export function PipelineTimeline({ currentStage, onStageClick }: PipelineTimelineProps) {
  const isEndState = END_STAGES.includes(currentStage)
  const currentIdx = isEndState ? -1 : PROGRESSION_STAGES.indexOf(currentStage)

  return (
    <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
      {/* Main progression */}
      <div className="flex items-center">
        {PROGRESSION_STAGES.map((stage, i) => {
          const meta = PIPELINE_STAGES[stage]
          const isPast = !isEndState && i < currentIdx
          const isCurrent = !isEndState && i === currentIdx

          return (
            <div key={stage} className="flex flex-1 items-center">
              {/* Connector line */}
              {i > 0 && (
                <div className={`h-0.5 flex-1 ${isPast || isCurrent ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`} />
              )}

              {/* Step circle */}
              <button
                onClick={() => onStageClick(stage)}
                title={meta.label}
                className="group relative flex flex-col items-center"
              >
                <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all ${
                  isCurrent
                    ? 'border-immo-accent-green bg-immo-accent-green text-immo-bg-primary shadow-md shadow-immo-accent-green/25'
                    : isPast
                      ? 'border-immo-accent-green bg-immo-accent-green/15 text-immo-accent-green'
                      : 'border-immo-border-default bg-immo-bg-primary text-immo-text-muted hover:border-immo-text-muted'
                }`}>
                  {isPast ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>

                <span className={`absolute -bottom-5 whitespace-nowrap text-[9px] ${
                  isCurrent ? 'font-semibold text-immo-accent-green' :
                  isPast ? 'text-immo-text-secondary' : 'text-immo-text-muted'
                }`}>
                  {meta.label}
                </span>
              </button>
            </div>
          )
        })}
      </div>

      {/* End state badges (relancement / perdue) */}
      {isEndState && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
            currentStage === 'perdue'
              ? 'bg-immo-status-red/10 text-immo-status-red border border-immo-status-red/20'
              : 'bg-immo-status-orange/10 text-immo-status-orange border border-immo-status-orange/20'
          }`}>
            {currentStage === 'perdue' ? <XCircle className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
            {PIPELINE_STAGES[currentStage].label}
          </div>
          <div className="flex gap-1.5">
            {END_STAGES.filter(s => s !== currentStage).map(s => (
              <button key={s} onClick={() => onStageClick(s)}
                className="rounded-full border border-immo-border-default px-3 py-1 text-[10px] font-medium text-immo-text-muted hover:bg-immo-bg-card-hover">
                {PIPELINE_STAGES[s].label}
              </button>
            ))}
            <button onClick={() => onStageClick('accueil')}
              className="rounded-full border border-immo-accent-green/30 bg-immo-accent-green/5 px-3 py-1 text-[10px] font-medium text-immo-accent-green hover:bg-immo-accent-green/10">
              Remettre dans le pipeline
            </button>
          </div>
        </div>
      )}

      {/* Quick access to end states when in progression */}
      {!isEndState && (
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => onStageClick('relancement')}
            className="flex items-center gap-1 rounded-full border border-immo-border-default px-2.5 py-1 text-[9px] font-medium text-immo-text-muted hover:border-immo-status-orange/30 hover:text-immo-status-orange transition-colors">
            <RotateCcw className="h-2.5 w-2.5" /> Relancement
          </button>
          <button onClick={() => onStageClick('perdue')}
            className="flex items-center gap-1 rounded-full border border-immo-border-default px-2.5 py-1 text-[9px] font-medium text-immo-text-muted hover:border-immo-status-red/30 hover:text-immo-status-red transition-colors">
            <XCircle className="h-2.5 w-2.5" /> Perdue
          </button>
        </div>
      )}
    </div>
  )
}
