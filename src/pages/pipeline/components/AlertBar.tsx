import { AlertTriangle, Clock, ListTodo } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PipelineAlert } from '@/hooks/usePipelineStats'

const ICONS = {
  urgent: AlertTriangle,
  relaunch: Clock,
  tasks: ListTodo,
} as const

const STYLES = {
  urgent: 'border-immo-status-red/30 bg-immo-status-red-bg text-immo-status-red',
  relaunch: 'border-immo-status-orange/30 bg-immo-status-orange-bg text-immo-status-orange',
  tasks: 'border-immo-accent-blue/30 bg-immo-accent-blue-bg text-immo-accent-blue',
} as const

interface AlertBarProps {
  alerts: PipelineAlert[]
  onAlertClick: (alert: PipelineAlert) => void
}

export function AlertBar({ alerts, onAlertClick }: AlertBarProps) {
  const { t } = useTranslation()
  if (alerts.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map((alert) => {
        const Icon = ICONS[alert.type]
        return (
          <button
            key={alert.type}
            onClick={() => onAlertClick(alert)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80 ${STYLES[alert.type]}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(alert.i18nKey, alert.i18nParams)}
          </button>
        )
      })}
    </div>
  )
}
