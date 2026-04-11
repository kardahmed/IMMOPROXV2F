import { ShieldX } from 'lucide-react'

export function SuspendedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-immo-bg-primary px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-immo-status-red/10">
          <ShieldX className="h-8 w-8 text-immo-status-red" />
        </div>
        <h1 className="text-xl font-bold text-immo-text-primary">Compte suspendu</h1>
        <p className="mt-2 text-sm text-immo-text-muted">
          Votre compte a ete suspendu. Veuillez contacter le support pour plus d'informations.
        </p>
        <a href="mailto:support@immoprox.com" className="mt-4 inline-block rounded-lg bg-immo-accent-green px-4 py-2 text-sm font-semibold text-white hover:bg-immo-accent-green/90">
          Contacter le support
        </a>
      </div>
    </div>
  )
}
