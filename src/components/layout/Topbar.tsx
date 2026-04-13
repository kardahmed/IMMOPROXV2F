import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, Moon, Sun, Menu } from 'lucide-react'
import { useMobile, useSidebarStore } from '@/hooks/useMobile'
import { useAuthStore } from '@/store/authStore'
import { useBranding } from '@/hooks/useBranding'
import { useDarkMode } from '@/hooks/useDarkMode'
import { Input } from '@/components/ui/input'
import { LanguageSwitch } from '@/components/common/LanguageSwitch'
import { NotificationBell } from '@/components/common/NotificationBell'
import { supabase } from '@/lib/supabase'

interface TopbarProps {
  title: string
  subtitle?: string
}

export function Topbar({ title, subtitle }: TopbarProps) {
  const { t } = useTranslation()
  const { userProfile, tenantId } = useAuthStore()
  useBranding()
  const { isDark, setTheme } = useDarkMode()
  const { isMobile } = useMobile()
  const { toggle: toggleSidebar } = useSidebarStore()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; type: string }>>([])
  const [showResults, setShowResults] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); setShowResults(false); return }
    const { data } = await supabase.from('clients').select('id, full_name').eq('tenant_id', tenantId!).ilike('full_name', `%${q}%`).limit(5)
    const results = (data ?? []).map(c => ({ id: c.id, name: (c as { full_name: string }).full_name, type: 'client' }))
    setSearchResults(results)
    setShowResults(results.length > 0)
  }, [tenantId])

  return (
    <header className="flex h-14 md:h-16 shrink-0 items-center justify-between border-b border-immo-border-default bg-immo-bg-sidebar px-3 md:px-6">
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex items-center gap-3">
        {isMobile && (
          <button onClick={toggleSidebar} className="rounded-lg p-2 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
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
        {/* Search — hidden on mobile, icon only on tablet */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-immo-text-muted rtl:left-auto rtl:right-3" />
          <Input
            type="text"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
            placeholder={t('common.search_placeholder')}
            className="h-9 w-[180px] lg:w-[240px] border-immo-border-default bg-immo-bg-primary pl-9 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:ring-immo-accent-green rtl:pl-3 rtl:pr-9"
          />
          {showResults && (
            <div className="absolute top-full left-0 z-50 mt-1 w-[300px] rounded-lg border border-immo-border-default bg-immo-bg-card shadow-lg">
              {searchResults.map(r => (
                <button key={r.id} onClick={() => { navigate(`/pipeline/clients/${r.id}`); setShowResults(false); setSearchQuery('') }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-immo-text-primary hover:bg-immo-bg-card-hover">
                  <Search className="h-3 w-3 text-immo-text-muted" />
                  {r.name}
                  <span className="ml-auto text-[10px] text-immo-text-muted">Client</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Dark mode toggle */}
        <button onClick={() => setTheme(isDark ? 'light' : 'dark')} title={isDark ? 'Mode clair' : 'Mode sombre'}
          className="rounded-lg p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
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
