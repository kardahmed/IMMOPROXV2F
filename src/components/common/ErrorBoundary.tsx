import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { AlertTriangle, RefreshCw, Home, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

interface State {
  error: Error | null
  errorInfo: ErrorInfo | null
}

interface Props {
  children: ReactNode
  // Used to reset the boundary when the route changes — passing the
  // current pathname here lets parents auto-recover after navigation.
  resetKey?: string
}

// React class component is required for componentDidCatch — no hook
// equivalent exists. The wrapper below adds router/i18n hooks.
class ErrorBoundaryClass extends Component<Props, State> {
  state: State = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, errorInfo: null }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo })
    // Best-effort log to Supabase — fire and forget, never throws.
    void logErrorToSupabase(error, errorInfo).catch(() => {})
    // Also surface in the dev console for local debugging.
    console.error('[ErrorBoundary] caught:', error, errorInfo)
  }

  componentDidUpdate(prev: Props) {
    // Auto-reset when the resetKey (typically location.pathname)
    // changes. Without this, navigating away from a crashed page
    // would still show the fallback.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, errorInfo: null })
    }
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ error: null, errorInfo: null })} />
    }
    return this.props.children
  }
}

// Hook-friendly wrapper so the class can use useLocation()/useTranslation()
// indirectly via the fallback child.
export function ErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <ErrorBoundaryClass resetKey={location.pathname}>{children}</ErrorBoundaryClass>
}

function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const details = `Error: ${error.message}\n\nStack:\n${error.stack ?? '—'}`
    navigator.clipboard.writeText(details).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-[480px] rounded-xl border border-immo-status-red/30 bg-immo-bg-card p-6 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-immo-status-red/10">
          <AlertTriangle className="h-6 w-6 text-immo-status-red" />
        </div>
        <h2 className="mb-2 text-base font-semibold text-immo-text-primary">
          {t('error_boundary.title')}
        </h2>
        <p className="mb-4 text-sm text-immo-text-secondary">
          {t('error_boundary.subtitle')}
        </p>

        <details className="mb-4 rounded-lg bg-immo-bg-primary px-3 py-2 text-xs text-immo-text-muted">
          <summary className="cursor-pointer font-medium text-immo-text-secondary">
            {t('error_boundary.show_details')}
          </summary>
          <p className="mt-2 break-words font-mono text-[11px] text-immo-status-red">
            {error.message}
          </p>
        </details>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onReset}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-immo-accent-green px-3 py-2 text-sm font-medium text-immo-bg-primary hover:bg-immo-accent-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t('error_boundary.retry')}
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-immo-border-default px-3 py-2 text-sm text-immo-text-secondary hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40"
          >
            <Home className="h-3.5 w-3.5" /> {t('error_boundary.go_home')}
          </button>
          <button
            onClick={handleCopy}
            aria-label={t('error_boundary.copy_details')}
            className="flex items-center gap-1.5 rounded-lg border border-immo-border-default px-3 py-2 text-sm text-immo-text-muted hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-immo-accent-green" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

// Best-effort logger. Writes to public.error_logs (created by migration
// 054). Failures are swallowed — we'd rather lose a log than re-trigger
// the error boundary while reporting an error.
async function logErrorToSupabase(error: Error, info: ErrorInfo) {
  try {
    const tenantId = useAuthStore.getState().tenantId
    const userId = useAuthStore.getState().session?.user?.id

    await supabase.from('error_logs' as never).insert({
      tenant_id: tenantId ?? null,
      user_id: userId ?? null,
      message: error.message?.slice(0, 1000) ?? 'Unknown error',
      stack: error.stack?.slice(0, 4000) ?? null,
      component_stack: info.componentStack?.slice(0, 4000) ?? null,
      url: window.location.href,
      user_agent: navigator.userAgent.slice(0, 500),
    } as never)
  } catch {
    // Logging is best-effort. Don't propagate.
  }
}
