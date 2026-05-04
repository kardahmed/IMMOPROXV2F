import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'

export interface WizardStep {
  label: string
}

interface WizardProps {
  steps: WizardStep[]
  currentStep: number
  onNext: () => void
  onPrev: () => void
  onFinish?: () => void
  finishLabel?: string
  children: ReactNode
  sidebar?: ReactNode
  loading?: boolean
}

export function Wizard({
  steps,
  currentStep,
  onNext,
  onPrev,
  onFinish,
  finishLabel,
  children,
  sidebar,
  loading = false,
}: WizardProps) {
  const { t } = useTranslation()
  const resolvedFinishLabel = finishLabel ?? t('action.create')
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  return (
    <div className="flex flex-col gap-6">
      {/* Step bar */}
      <div className="flex items-center gap-2">
        {steps.map((step, i) => {
          const isDone = i < currentStep
          const isActive = i === currentStep
          const isFuture = i > currentStep

          return (
            <div key={step.label} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-8 ${
                    isDone ? 'bg-immo-accent-green' : 'bg-immo-border-default'
                  }`}
                />
              )}

              <div className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isDone
                      ? 'bg-immo-accent-green text-immo-bg-primary'
                      : isActive
                        ? 'bg-immo-accent-green/15 text-immo-accent-green ring-1 ring-immo-accent-green/40'
                        : 'bg-immo-bg-card-hover text-immo-text-muted'
                  }`}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={`hidden text-sm sm:inline ${
                    isActive
                      ? 'font-medium text-immo-text-primary'
                      : isFuture
                        ? 'text-immo-text-muted'
                        : 'text-immo-text-secondary'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Content area */}
      <div className={sidebar ? 'flex gap-6' : ''}>
        <div className={sidebar ? 'flex-1' : 'w-full'}>{children}</div>
        {sidebar && (
          <div className="w-[320px] shrink-0 rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
            {sidebar}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-immo-border-default pt-4">
        <Button
          variant="ghost"
          onClick={onPrev}
          disabled={isFirst || loading}
          className="text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary disabled:opacity-30"
        >
          <ChevronLeft className="me-1 h-4 w-4" />
          {t('action.previous')}
        </Button>

        {isLast ? (
          <Button
            onClick={onFinish ?? onNext}
            disabled={loading}
            className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-immo-bg-primary border-t-transparent" />
            ) : (
              resolvedFinishLabel
            )}
          </Button>
        ) : (
          <Button
            onClick={onNext}
            disabled={loading}
            className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90"
          >
            {t('action.next')}
            <ChevronRight className="ms-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
