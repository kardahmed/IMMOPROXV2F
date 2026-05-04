import { useTranslation } from 'react-i18next'
import { Search, Moon, Sun, Menu, Command } from 'lucide-react'
import { useMobile, useSidebarStore } from '@/hooks/useMobile'
import { useAuthStore } from '@/store/authStore'
import { useBranding } from '@/hooks/useBranding'
import { useDarkMode } from '@/hooks/useDarkMode'
import { LanguageSwitch } from '@/components/common/LanguageSwitch'
import { NotificationBell } from '@/components/common/NotificationBell'

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { t } = useTranslation()
  const { userProfile } = useAuthStore()
  useBranding()
  const { isDark, setTheme } = useDarkMode()
  const { isMobile } = useMobile()
  const { toggle: toggleSidebar } = useSidebarStore()

  function openPalette() {
    // Lightweight pubsub between the topbar trigger and the
    // useKeyboardShortcuts hook that owns the palette state.
    window.dispatchEvent(new CustomEvent('immo:open-palette'))
  }

  return (
    <header className="flex min-h-[3.5rem] md:min-h-[4rem] shrink-0 items-center justify-between border-b border-immo-border-default bg-immo-bg-sidebar px-3 md:px-6 pt-[env(safe-area-inset-top)]">
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex items-center gap-3">
        {isMobile && (
          <button onClick={toggleSidebar} aria-label="Ouvrir le menu" className="rounded-lg p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40">
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div>
          <h1 className="text-base md:text-lg font-semibold text-immo-text-primary">{title}</h1>
          {subtitle && !isMobile && (
            <p className="text-xs text-immo-text-muted">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Right: search + lang + notifs + avatar */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Search trigger button — opens the Cmd+K palette */}
        <button
          onClick={openPalette}
          aria-label={t('command_palette.title')}
          className="hidden h-9 items-center gap-2 rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-muted transition-colors hover:border-immo-accent-green/40 hover:text-immo-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40 md:flex md:w-[180px] lg:w-[240px]"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-start">{t('common.search_placeholder')}</span>
          <span className="hidden items-center gap-0.5 rounded border border-immo-border-default bg-immo-bg-card px-1.5 py-0.5 text-[10px] lg:flex">
            <Command className="h-2.5 w-2.5" />K
          </span>
        </button>

        {/* Dark mode toggle */}
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
          title={isDark ? 'Mode clair' : 'Mode sombre'}
          className="rounded-lg p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Language switch — hidden on mobile */}
        <div className="hidden md:block"><LanguageSwitch /></div>

        {/* Notifications */}
        <NotificationBell />

        {/* Avatar */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-immo-accent-blue/15 text-xs font-semibold text-immo-accent-blue">
          {userProfile?.first_name?.[0]}
          {userProfile?.last_name?.[0]}
        </div>
      </div>
    </header>
  )
}
