import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Building2, BarChart3, Settings, LogOut, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSuperAdminStore } from '@/store/superAdminStore'

const NAV_ITEMS = [
  { to: '/admin', icon: Building2, labelKey: 'Tenants', end: true },
  { to: '/admin/stats', icon: BarChart3, labelKey: 'Statistiques' },
  { to: '/admin/settings', icon: Settings, labelKey: 'Plateforme' },
] as const

export function SuperAdminLayout() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { inspectedTenantId, inspectedTenantName, leaveTenant } = useSuperAdminStore()

  return (
    <div className="flex h-screen bg-[#060A15]">
      {/* Sidebar */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[#1E325A]/50 bg-[#060A15]">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7C3AED]">
            <span className="text-sm font-bold text-white">IP</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">IMMO PRO-X</h1>
            <span className="rounded-sm bg-[#7C3AED]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#7C3AED]">
              Super Admin
            </span>
          </div>
        </div>

        <div className="my-2 mx-5 h-px bg-[#1E325A]/50" />

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV_ITEMS.map(({ to, icon: Icon, labelKey, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-[#7C3AED]/15 font-medium text-[#7C3AED]'
                    : 'text-[#7F96B7] hover:bg-[#0F1830] hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {labelKey}
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
        <div className="border-t border-[#1E325A]/50 p-3">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[#7F96B7] hover:bg-[#0F1830] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Deconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Inspection banner */}
        {inspectedTenantId && (
          <div className="flex items-center justify-between bg-[#FF9A1E] px-5 py-2">
            <span className="text-sm font-semibold text-[#0A1030]">
              Mode inspection : {inspectedTenantName}
            </span>
            <button
              onClick={() => { leaveTenant(); navigate('/admin') }}
              className="rounded-md bg-[#0A1030]/20 px-3 py-1 text-xs font-medium text-[#0A1030] hover:bg-[#0A1030]/30"
            >
              Retour admin
            </button>
          </div>
        )}

        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
