import { Lock, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Props {
  featureName?: string
  reason: 'plan' | 'tenant' | null
}

export function FeatureUnavailable({ featureName, reason }: Props) {
  const title = featureName ?? 'Cette fonctionnalité'

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-immo-accent-green/10">
        <Lock className="h-7 w-7 text-immo-accent-green" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-immo-text-primary">
        {title} n'est pas disponible
      </h1>

      {reason === 'plan' ? (
        <>
          <p className="mt-2 max-w-md text-sm text-immo-text-muted">
            Cette fonctionnalité n'est pas incluse dans votre plan actuel. Contactez l'administrateur IMMO PRO-X pour passer à un plan supérieur.
          </p>
          <a
            href="mailto:contact@immoprox.io"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-immo-accent-green px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Contacter IMMO PRO-X
          </a>
        </>
      ) : (
        <>
          <p className="mt-2 max-w-md text-sm text-immo-text-muted">
            Cette fonctionnalité a été désactivée par l'administrateur de votre agence. Vous pouvez la réactiver depuis les paramètres.
          </p>
          <Link
            to="/settings"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-immo-accent-green px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Settings className="h-4 w-4" /> Paramètres
          </Link>
        </>
      )}
    </div>
  )
}
