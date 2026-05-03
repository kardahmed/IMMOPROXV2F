import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { Building2, BarChart3, Settings, LogOut, ArrowLeft, ScrollText, CreditCard, MessageSquare, Headphones, Megaphone, Activity, Layers, Sparkles, MessageCircle, Mail, ChevronRight, Moon, Sun, Inbox, ShieldAlert, Receipt, AlertTriangle, Plug, Menu, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useSuperAdminStore } from '@/store/superAdminStore'
import { LanguageSwitch } from '@/components/common/LanguageSwitch'
import { HealthAlertsBanner } from './components/HealthAlertsBanner'
import { GlobalSearch } from './components/GlobalSearch'
import { NotificationCenter } from './components/NotificationCenter'

type NavItem = {
  to: string
  icon: typeof Building2
  labelKey: string
  end?: boolean
}

type NavSection = { title: string; items: readonly NavItem[] }

const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: 'Activite',
    items: [
      { to: '/admin', icon: Building2, labelKey: 'Tenants', end: true },
      { to: '/admin/leads', icon: Inbox, labelKey: 'Leads' },
      { to: '/admin/support', icon: Headphones, labelKey: 'Support' },
      { to: '/admin/messages', icon: MessageSquare, labelKey: 'Messages' },
    ],
  },
  {
    title: 'Monetisation',
    items: [
      { to: '/admin/plans', icon: Layers, labelKey: 'Plans' },
      { to: '/admin/billing', icon: CreditCard, labelKey: 'Paiements' },
      { to: '/admin/costs', icon: Receipt, labelKey: 'Couts & profit' },
    ],
  },
  {
    title: 'Analytique',
    items: [
      { to: '/admin/stats', icon: BarChart3, labelKey: 'Statistiques' },
      { to: '/admin/monitoring', icon: Activity, labelKey: 'Monitoring' },
    ],
  },
  {
    title: 'Securite',
    items: [
      { to: '/admin/security', icon: ShieldAlert, labelKey: 'Audit securite' },
      { to: '/admin/logs', icon: ScrollText, labelKey: 'Audit Trail' },
      { to: '/admin/error-logs', icon: AlertTriangle, labelKey: 'Logs erreurs' },
    ],
  },
  {
    title: 'Communications',
    items: [
      { to: '/admin/emails', icon: Mail, labelKey: 'Emails' },
      { to: '/admin/whatsapp', icon: MessageCircle, labelKey: 'WhatsApp' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { to: '/admin/playbook', icon: Sparkles, labelKey: 'Playbook IA' },
      { to: '/admin/integrations', icon: Plug, labelKey: 'Intégrations' },
      { to: '/admin/changelog', icon: Megaphone, labelKey: 'Changelog' },
      { to: '/admin/settings', icon: Settings, labelKey: 'Plateforme' },
    ],
  },
]

const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap(s => s.items)

function SidebarBody({ onNavClick, onClose, signOut, navigate, inspectedTenantId, inspectedTenantName }: {
  onNavClick?: () => void
  onClose?: () => void
  signOut: () => void
  navigate: ReturnType<typeof useNavigate>
  inspectedTenantId: string | null
  inspectedTenantName: string | null
}) {
  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
      {/* Logo + close (mobile only) */}
      <div className="flex items-center gap-3 px-5 py-5">
        <img src="/logo-180.png" alt="IMMO PRO-X" className="h-9 w-9" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold text-immo-text-primary">IMMO PRO-X</h1>
          <span className="rounded-sm bg-[#0579DA]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#0579DA]">
            Super Admin
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="md:hidden shrink-0 rounded-md p-1.5 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="my-2 mx-5 h-px bg-immo-border-default/50" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={section.title} className={sIdx === 0 ? '' : 'mt-4'}>
            <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted/70">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map(({ to, icon: Icon, labelKey, ...rest }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={'end' in rest}
                  onClick={onNavClick}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                      isActive
                        ? 'bg-[#0579DA]/15 font-semibold text-[#0579DA]'
                        : 'text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[#0579DA]" />
                      )}
                      <Icon className={`h-4 w-4 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} />
                      {labelKey}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Back to app (only if inspecting a tenant) */}
      {inspectedTenantId && (
        <button
          onClick={() => { navigate('/dashboard'); onNavClick?.() }}
          className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-[#0579DA]/30 px-3 py-2 text-xs text-[#0579DA] hover:bg-[#0579DA]/10"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour app ({inspectedTenantName})
        </button>
      )}

      {/* Logout */}
      <div className="border-t border-immo-border-default/50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <button
          onClick={signOut}
          className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-immo-text-secondary transition-colors hover:bg-immo-status-red/10 hover:text-immo-status-red"
        >
          <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Deconnexion
        </button>
      </div>
    </div>
  )
}

export function SuperAdminLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDark, setTheme } = useDarkMode()
  const { inspectedTenantId, inspectedTenantName, leaveTenant } = useSuperAdminStore()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Find current page label from NAV_ITEMS (longest matching prefix wins for nested routes like /admin/tenants/:id)
  const currentPage = [...NAV_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find(item => item.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(item.to))
    ?? (location.pathname.startsWith('/admin/tenants/') ? { labelKey: 'Detail tenant', icon: Building2 } : null)

  const closeDrawer = () => setDrawerOpen(false)

  return (
    <div className="flex h-[100dvh] bg-immo-bg-primary">
      {/* Desktop sidebar */}
      <aside aria-label="Navigation Super Admin" className="hidden md:flex w-[240px] shrink-0 flex-col border-r border-immo-border-default/50 bg-immo-bg-card">
        <SidebarBody
          signOut={signOut}
          navigate={navigate}
          inspectedTenantId={inspectedTenantId}
          inspectedTenantName={inspectedTenantName}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeDrawer} />
      )}
      <aside
        aria-label="Navigation Super Admin"
        className={`fixed left-0 top-0 z-50 h-[100dvh] w-[260px] flex-col border-r border-immo-border-default/50 bg-immo-bg-card transition-transform duration-300 md:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        } flex`}
      >
        <SidebarBody
          onNavClick={closeDrawer}
          onClose={closeDrawer}
          signOut={signOut}
          navigate={navigate}
          inspectedTenantId={inspectedTenantId}
          inspectedTenantName={inspectedTenantName}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Topbar with breadcrumbs + search */}
        <div
          className="flex items-center gap-3 md:gap-6 border-b border-immo-border-default/50 bg-immo-bg-card px-3 md:px-6 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))]"
        >
          {/* Mobile hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Ouvrir le menu"
            className="md:hidden rounded-lg p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center gap-1.5 text-xs">
            <span className="text-immo-text-muted">Super Admin</span>
            {currentPage && (
              <>
                <ChevronRight className="h-3 w-3 shrink-0 text-immo-text-muted" />
                <span className="flex items-center gap-1.5 truncate font-medium text-immo-text-primary">
                  <currentPage.icon className="h-3.5 w-3.5 shrink-0 text-[#0579DA]" />
                  {currentPage.labelKey}
                </span>
              </>
            )}
          </nav>

          <div className="flex-1" />

          <div className="hidden md:block">
            <GlobalSearch />
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
            title={isDark ? 'Mode clair' : 'Mode sombre'}
            className="rounded-lg p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0579DA]/40"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Language switch — hidden on mobile */}
          <div className="hidden md:block">
            <LanguageSwitch />
          </div>

          <NotificationCenter />
        </div>

        {/* Inspection banner */}
        {inspectedTenantId && (
          <div className="flex items-center justify-between bg-immo-status-orange px-5 py-2">
            <span className="text-sm font-semibold text-white">
              Mode inspection : {inspectedTenantName}
            </span>
            <button
              onClick={() => { leaveTenant(); navigate('/admin') }}
              className="rounded-md bg-black/20 px-3 py-1 text-xs font-medium text-white hover:bg-black/30"
            >
              Retour admin
            </button>
          </div>
        )}

        {/* Health alerts */}
        <HealthAlertsBanner />

        <div className="p-3 md:p-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
