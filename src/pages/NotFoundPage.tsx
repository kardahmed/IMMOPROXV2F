import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'

export function NotFoundPage() {
  const { t } = useTranslation()
  // If the user is logged out, send them to /login instead of
  // /dashboard (which would bounce through ProtectedRoute and end
  // up at /login anyway, just with a flicker).
  const session = useAuthStore(s => s.session)
  const homePath = session ? '/dashboard' : '/login'

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-immo-bg-primary">
      <div className="text-6xl font-bold text-immo-accent-green">404</div>
      <p className="text-immo-text-secondary">{t('not_found.title')}</p>
      <Link
        to={homePath}
        className="text-sm text-immo-accent-blue hover:underline"
      >
        {t('not_found.go_back')}
      </Link>
    </div>
  )
}
