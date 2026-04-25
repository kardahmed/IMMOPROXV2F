import { Lock, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface Props {
  featureName?: string
  reason: 'plan' | 'tenant' | null
}

export function FeatureUnavailable({ featureName, reason }: Props) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-immo-accent-green/10">
        <Lock className="h-7 w-7 text-immo-accent-green" />
      </div>
      <h1 className="mt-5 text-lg font-bold text-immo-text-primary">
        {featureName
          ? t('feature.unavailable_title', { name: featureName })
          : t('feature.unavailable_generic')}
      </h1>

      {reason === 'plan' ? (
        <>
          <p className="mt-2 max-w-md text-sm text-immo-text-muted">
            {t('feature.unavailable_plan_desc')}
          </p>
          <a
            href="mailto:contact@immoprox.io"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-immo-accent-green px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {t('feature.contact_support')}
          </a>
        </>
      ) : (
        <>
          <p className="mt-2 max-w-md text-sm text-immo-text-muted">
            {t('feature.unavailable_tenant_desc')}
          </p>
          <Link
            to="/settings"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-immo-accent-green px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Settings className="h-4 w-4" /> {t('feature.to_settings')}
          </Link>
        </>
      )}
    </div>
  )
}
