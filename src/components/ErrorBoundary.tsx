import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    // Best-effort log to public.error_logs (migration 054). The
    // bootstrap-level boundary now mirrors the in-app one's
    // behavior — errors during the initial mount (before AppLayout)
    // were lost in prod because we'd only console.error and Sentry
    // isn't wired. Insert is RLS-gated to authenticated users; the
    // catch block swallows failures so we don't re-trigger the
    // boundary while reporting itself.
    void logErrorToSupabase(error, info).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-immo-status-red/10">
              <AlertTriangle className="h-7 w-7 text-immo-status-red" />
            </div>
            <h2 className="text-lg font-bold text-immo-text-primary">Une erreur est survenue</h2>
            <p className="mt-2 text-sm text-immo-text-secondary">
              {/* Audit (HIGH/A09): leaking raw error.message in prod
                  could expose Postgres / RLS / SQL details. Show a
                  generic line in production builds. */}
              {import.meta.env.PROD
                ? 'Une erreur inattendue est survenue. Rechargez la page ou contactez le support si le problème persiste.'
                : (this.state.error?.message ?? 'Erreur inconnue')}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-immo-accent-green px-4 py-2 text-sm font-semibold text-white hover:bg-immo-accent-green/90"
            >
              <RefreshCw className="h-4 w-4" /> Recharger la page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Best-effort writer to public.error_logs (migration 054). Mirrors
// the implementation in components/common/ErrorBoundary.tsx so a
// future consolidation can dedupe — for now both boundaries log
// independently, RLS deduplicates server-side.
async function logErrorToSupabase(error: Error, info: React.ErrorInfo) {
  try {
    await supabase.from('error_logs' as never).insert({
      tenant_id: null, // bootstrap level — no auth context guaranteed
      user_id: null,
      message: error.message?.slice(0, 1000) ?? 'Unknown error',
      stack: error.stack?.slice(0, 4000) ?? null,
      component_stack: info.componentStack?.slice(0, 4000) ?? null,
      url: typeof window !== 'undefined' ? window.location.href : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
    } as never)
  } catch {
    // Swallow — logging is best-effort, never blocks rendering.
  }
}
