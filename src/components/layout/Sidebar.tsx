import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard,
  Building2,
  GitBranch,
  Calendar,
  FolderOpen,
  Target,
  TrendingUp,
  Users,
  BarChart3,
  Settings,
  Globe,
  LogOut,
  CheckSquare,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'
import { useBranding } from '@/hooks/useBranding'
import { getVisibleNavItems } from '@/lib/navigation'
import { Separator } from '@/components/ui/separator'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Building2,
  GitBranch,
  Calendar,
  FolderOpen,
  Target,
  TrendingUp,
  Users,
  BarChart3,
  Settings,
  Globe,
  CheckSquare,
}

// Map nav path → i18n key
const NAV_KEYS: Record<string, string> = {
  '/dashboard': 'nav.dashboard',
  '/projects': 'nav.projects',
  '/pipeline': 'nav.pipeline',
  '/tasks': 'Taches',
  '/planning': 'nav.planning',
  '/dossiers': 'nav.dossiers',
  '/goals': 'nav.goals',
  '/performance': 'nav.performance',
  '/agents': 'nav.agents',
  '/landing': 'nav.landing',
  '/reports': 'nav.reports',
  '/settings': 'nav.settings',
}

export function Sidebar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { signOut } = useAuth()
  const { userProfile, role } = useAuthStore()
  const { logoUrl, appName } = useBranding()
  const navItems = getVisibleNavItems(role)

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-immo-border-default bg-immo-bg-sidebar rtl:border-l rtl:border-r-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <img src={logoUrl} alt={appName} className="h-9 w-9 rounded-lg object-contain" />
        <div>
          <div className="text-sm font-bold tracking-tight text-immo-text-primary">
            {appName}
          </div>
          <div className="text-[10px] text-immo-text-muted">{t('common.version')}</div>
        </div>
      </div>

      <Separator className="bg-immo-border-default" />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const Icon = ICONS[item.icon]
          const isActive = location.pathname === item.path

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-immo-accent-green/10 text-immo-accent-green'
                  : 'text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary'
              }`}
            >
              {/* Active bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-immo-accent-green rtl:left-auto rtl:right-0 rtl:rounded-l-full rtl:rounded-r-none" />
              )}

              {Icon && (
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 ${
                    isActive ? 'text-immo-accent-green' : 'text-immo-text-muted group-hover:text-immo-text-secondary'
                  }`}
                />
              )}

              <span className="truncate">
                {t(NAV_KEYS[item.path] ?? item.label)}
              </span>
            </Link>
          )
        })}
      </nav>

      <Separator className="bg-immo-border-default" />

      {/* User info + logout */}
      <div className="px-3 py-4">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-immo-accent-green/15 text-xs font-semibold text-immo-accent-green">
            {userProfile?.first_name?.[0]}
            {userProfile?.last_name?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-immo-text-primary">
              {userProfile?.first_name} {userProfile?.last_name}
            </div>
            <div className="text-[11px] text-immo-text-muted">
              {role ? t(`role.${role}`) : ''}
            </div>
          </div>
          <button
            onClick={signOut}
            className="shrink-0 rounded-md p-1.5 text-immo-text-muted transition-colors hover:bg-immo-status-red-bg hover:text-immo-status-red"
            title={t('action.logout')}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
