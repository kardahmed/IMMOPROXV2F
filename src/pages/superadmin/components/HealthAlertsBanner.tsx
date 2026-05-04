import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useTenantHealth } from '../hooks/useTenantHealth'
import type { HealthAlert } from '../hooks/useTenantHealth'

export function HealthAlertsBanner() {
  const { data } = useTenantHealth()
  const [expanded, setExpanded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const navigate = useNavigate()

  if (!data || data.alerts.length === 0 || dismissed) return null

  const criticalAlerts = data.alerts.filter(a => a.severity === 'critical')
  const warningAlerts = data.alerts.filter(a => a.severity === 'warning')
  const totalAlerts = data.alerts.length
  const preview = data.alerts.slice(0, 3)

  return (
    <div className="mx-6 mt-4 rounded-xl border border-immo-status-red/30 bg-immo-status-red-bg">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-immo-status-red" />
        <div className="flex-1">
          <span className="text-sm font-semibold text-immo-status-red">
            {criticalAlerts.length > 0 && `${criticalAlerts.length} critique(s)`}
            {criticalAlerts.length > 0 && warningAlerts.length > 0 && ' · '}
            {warningAlerts.length > 0 && `${warningAlerts.length} avertissement(s)`}
          </span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Reduire les alertes' : 'Afficher toutes les alertes'}
          aria-expanded={expanded}
          className="rounded-md p-1 text-immo-status-red/60 transition-colors hover:bg-immo-status-red/10 hover:text-immo-status-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-status-red/40"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Masquer les alertes"
          className="rounded-md p-1 text-immo-status-red/40 transition-colors hover:bg-immo-status-red/10 hover:text-immo-status-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-status-red/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Alerts list */}
      {expanded && (
        <div className="border-t border-immo-status-red/20 px-4 py-2">
          <div className="max-h-[200px] space-y-1.5 overflow-y-auto">
            {data.alerts.map((alert, i) => (
              <AlertRow key={i} alert={alert} onNavigate={() => navigate(`/admin/tenants/${alert.tenant_id}`)} />
            ))}
          </div>
        </div>
      )}

      {/* Collapsed preview */}
      {!expanded && (
        <div className="border-t border-immo-status-red/20 px-4 py-2">
          <div className="space-y-1">
            {preview.map((alert, i) => (
              <AlertRow key={i} alert={alert} onNavigate={() => navigate(`/admin/tenants/${alert.tenant_id}`)} />
            ))}
          </div>
          {totalAlerts > 3 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1 text-[11px] text-immo-status-red/60 hover:text-immo-status-red"
            >
              + {totalAlerts - 3} autre(s)...
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AlertRow({ alert, onNavigate }: { alert: HealthAlert; onNavigate: () => void }) {
  return (
    <button
      onClick={onNavigate}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start hover:bg-immo-status-red/5"
    >
      <div className={`h-2 w-2 shrink-0 rounded-full ${alert.severity === 'critical' ? 'bg-immo-status-red' : 'bg-immo-status-orange'}`} />
      <span className="flex-1 text-xs text-immo-status-red">{alert.message}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-immo-status-red/40" />
    </button>
  )
}
