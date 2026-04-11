import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

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
              {this.state.error?.message ?? 'Erreur inconnue'}
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
