import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Input } from '@/components/ui/input'
import { LanguageSwitch } from '@/components/common/LanguageSwitch'
import { NotificationBell } from '@/components/common/NotificationBell'

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { t } = useTranslation()
  const { userProfile } = useAuthStore()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-immo-border-default bg-immo-bg-sidebar px-6">
      {/* Left: page title */}
      <div>
        <h1 className="text-lg font-semibold text-immo-text-primary">{title}</h1>
        {subtitle && (
          <p className="text-xs text-immo-text-muted">{subtitle}</p>
        )}
      </div>

      {/* Right: search + lang + notifs + avatar */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-immo-text-muted rtl:left-auto rtl:right-3" />
          <Input
            type="text"
            placeholder={t('common.search_placeholder')}
            className="h-9 w-[240px] border-immo-border-default bg-immo-bg-primary pl-9 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:ring-immo-accent-green rtl:pl-3 rtl:pr-9"
          />
        </div>

        {/* Language switch */}
        <LanguageSwitch />

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
