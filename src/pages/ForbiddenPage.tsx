import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

export function ForbiddenPage() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-immo-bg-primary px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-immo-status-red/10">
        <ShieldAlert className="h-8 w-8 text-immo-status-red" />
      </div>
      <div className="text-6xl font-bold text-immo-status-red">403</div>
      <p className="text-immo-text-primary font-semibold">Acces refuse</p>
      <p className="max-w-md text-sm text-immo-text-secondary">
        Vous n'avez pas les autorisations necessaires pour acceder a cette ressource.
        Contactez votre administrateur si vous pensez qu'il s'agit d'une erreur.
      </p>
      <Link to="/dashboard" className="text-sm font-semibold text-immo-accent-blue hover:underline">
        Retour au dashboard
      </Link>
    </div>
  )
}
