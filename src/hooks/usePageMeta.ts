import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const PAGE_KEYS: Record<string, { titleKey: string; subtitleKey: string }> = {
  '/dashboard': { titleKey: 'nav.dashboard', subtitleKey: 'page.dashboard_subtitle' },
  '/projects': { titleKey: 'nav.projects', subtitleKey: 'page.projects_subtitle' },
  '/pipeline': { titleKey: 'nav.pipeline', subtitleKey: 'page.pipeline_subtitle' },
  '/planning': { titleKey: 'nav.planning', subtitleKey: 'page.planning_subtitle' },
  '/dossiers': { titleKey: 'nav.dossiers', subtitleKey: 'page.dossiers_subtitle' },
  '/goals': { titleKey: 'nav.goals', subtitleKey: 'page.goals_subtitle' },
  '/performance': { titleKey: 'nav.performance', subtitleKey: 'page.performance_subtitle' },
  '/agents': { titleKey: 'nav.agents', subtitleKey: 'page.agents_subtitle' },
  '/reports': { titleKey: 'nav.reports', subtitleKey: 'page.reports_subtitle' },
  '/integrations': { titleKey: 'nav.integrations', subtitleKey: 'page.integrations_subtitle' },
  '/changelog': { titleKey: 'nav.changelog', subtitleKey: 'page.changelog_subtitle' },
  '/profile': { titleKey: 'profile.title', subtitleKey: 'profile.subtitle' },
  '/settings': { titleKey: 'nav.settings', subtitleKey: 'page.settings_subtitle' },
}

export function usePageMeta() {
  const { pathname } = useLocation()
  const { t } = useTranslation()

  const keys = PAGE_KEYS[pathname]
  if (!keys) return { title: t('common.app_name') }

  return {
    title: t(keys.titleKey),
    subtitle: t(keys.subtitleKey),
  }
}
