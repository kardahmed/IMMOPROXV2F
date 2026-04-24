import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Building2, BarChart3, Settings, LogOut, ArrowLeft, ScrollText, CreditCard, MessageSquare, Headphones, Megaphone, Activity, Layers, Sparkles, MessageCircle, Mail, ChevronRight, Moon, Sun, Inbox, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useSuperAdminStore } from '@/store/superAdminStore'
import { LanguageSwitch } from '@/components/common/LanguageSwitch'
import { HealthAlertsBanner } from './components/HealthAlertsBanner'
import { GlobalSearch } from './components/GlobalSearch'
import { NotificationCenter } from './components/NotificationCenter'

const NAV_ITEMS = [
  { to: '/admin', icon: Building2, labelKey: 'Tenants', end: true },
  { to: '/admin/leads', icon: Inbox, labelKey: 'Leads' },
  { to: '/admin/plans', icon: Layers, labelKey: 'Plans' },
  { to: '/admin/billing', icon: CreditCard, labelKey: 'Facturation' },
  { to: '/admin/messages', icon: MessageSquare, labelKey: 'Messages' },
  { to: '/admin/support', icon: Headphones, labelKey: 'Support' },
  { to: '/admin/security', icon: ShieldAlert, labelKey: 'Audit securite' },
  { to: '/admin/logs', icon: ScrollText, labelKey: 'Audit Trail' },
  { to: '/admin/changelog', icon: Megaphone, labelKey: 'Changelog' },
  { to: '/admin/monitoring', icon: Activity, labelKey: 'Monitoring' },
  { to: '/admin/stats', icon: BarChart3, labelKey: 'Statistiques' },
  { to: '/admin/playbook', icon: Sparkles, labelKey: 'Playbook IA' },
  { to: '/admin/emails', icon: Mail, labelKey: 'Emails' },
  { to: '/admin/whatsapp', icon: MessageCircle, labelKey: 'WhatsApp' },
  { to: '/admin/settings', icon: Settings, labelKey: 'Plateforme' },
] as const

export function SuperAdminLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { isDark, setTheme } = useDarkMode()
  const { inspectedTenantId, inspectedTenantName, leaveTenant } = useSuperAdminStore()

  // Find current page label from NAV_ITEMS (longest matching prefix wins for nested routes like /admin/tenants/:id)
  const currentPage = [...NAV_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find(item => item.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(item.to))
    ?? (location.pathname.startsWith('/admin/tenants/') ? { labelKey: 'Detail tenant', icon: Building2 } : null)

  return (
    <div className="flex h-screen bg-immo-bg-primary">
      {/* Sidebar */}
      <aside aria-label="Navigation Super Admin" className="flex w-[240px] shrink-0 flex-col border-r border-immo-border-default/50 bg-immo-bg-card">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/logo-180.png" alt="IMMO PRO-X" className="h-9 w-9" />
          <div>
            <h1 className="text-sm font-bold text-immo-text-primary">IMMO PRO-X</h1>
            <span className="rounded-sm bg-[#7C3AED]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#7C3AED]">
              Super Admin
            </span>
          </div>
        </div>

        <div className="my-2 mx-5 h-px bg-immo-border-default/50" />

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV_ITEMS.map(({ to, icon: Icon, labelKey, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest}
              className={({ isActive }) =>
                `group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                  isActive
                    ? 'bg-[#7C3AED]/15 font-semibold text-[#7C3AED]'
                    : 'text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[#7C3AED]" />
                  )}
                  <Icon className={`h-4 w-4 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} />
                  {labelKey}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Back to app (only if inspecting a tenant) */}
        {inspectedTenantId && (
          <button
            onClick={() => navigate('/dashboard')}
            className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-[#7C3AED]/30 px-3 py-2 text-xs text-[#7C3AED] hover:bg-[#7C3AED]/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour app ({inspectedTenantName})
          </button>
        )}

        {/* Logout */}
        <div className="border-t border-immo-border-default/50 p-3">
          <button
            onClick={signOut}
            className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-immo-text-secondary transition-colors hover:bg-immo-status-red/10 hover:text-immo-status-red"
          >
            <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Deconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Topbar with breadcrumbs + search */}
        <div className="flex items-center gap-6 border-b border-immo-border-default/50 bg-immo-bg-card px-6 py-3">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center gap-1.5 text-xs">
            <span className="text-immo-text-muted">Super Admin</span>
            {currentPage && (
              <>
                <ChevronRight className="h-3 w-3 shrink-0 text-immo-text-muted" />
                <span className="flex items-center gap-1.5 truncate font-medium text-immo-text-primary">
                  <currentPage.icon className="h-3.5 w-3.5 shrink-0 text-[#7C3AED]" />
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
            className="rounded-lg p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
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

        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
