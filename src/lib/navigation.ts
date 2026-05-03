import type { UserRole } from '@/types'
import type { PermissionKey } from '@/types/permissions'

export interface NavItem {
  label: string
  path: string
  icon: string
  roles: UserRole[] | 'all'
  requiredPermission?: PermissionKey
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', roles: 'all', requiredPermission: 'dashboard.view' },
  { label: 'Projets', path: '/projects', icon: 'Building2', roles: 'all', requiredPermission: 'projects.view' },
  { label: 'Pipeline', path: '/pipeline', icon: 'GitBranch', roles: 'all', requiredPermission: 'pipeline.view_own' },
  { label: 'Taches', path: '/tasks', icon: 'CheckSquare', roles: 'all' },
  { label: 'Boite messages', path: '/inbox', icon: 'MessageSquare', roles: 'all' },
  { label: 'Planning', path: '/planning', icon: 'Calendar', roles: 'all', requiredPermission: 'visits.view_own' },
  { label: 'Dossiers', path: '/dossiers', icon: 'FolderOpen', roles: 'all', requiredPermission: 'dossiers.view' },
  { label: 'Objectifs', path: '/goals', icon: 'Target', roles: 'all', requiredPermission: 'goals.view_own' },
  { label: 'Performance', path: '/performance', icon: 'TrendingUp', roles: 'all', requiredPermission: 'performance.view_own' },
  { label: 'Agents', path: '/agents', icon: 'Users', roles: ['admin', 'super_admin'], requiredPermission: 'agents.view' },
  { label: 'Pages capture', path: '/landing', icon: 'Globe', roles: ['admin', 'super_admin'], requiredPermission: 'landing.view' },
  { label: 'Rapports', path: '/reports', icon: 'BarChart3', roles: ['admin', 'super_admin'], requiredPermission: 'reports.view' },
  { label: 'ROI Marketing', path: '/marketing-roi', icon: 'Target', roles: ['admin', 'super_admin'] },
  { label: 'Paramètres', path: '/settings', icon: 'Settings', roles: ['admin', 'super_admin'], requiredPermission: 'settings.view' },
]

export function getVisibleNavItems(
  role: UserRole | null,
  can?: (permission: PermissionKey) => boolean,
): NavItem[] {
  if (!role) return []
  if (role === 'super_admin') return NAV_ITEMS

  return NAV_ITEMS.filter((item) => {
    // Hard role gate first — admin-only items must never leak to agents
    // even if they happen to lack a requiredPermission.
    if (Array.isArray(item.roles) && !item.roles.includes(role)) return false
    // Items with no requiredPermission are visible to every role they
    // accept (covers /tasks, /inbox, etc.).
    if (!item.requiredPermission) return true
    // Items with requiredPermission rely on the user's permission profile.
    // Admin bypasses inside usePermissions.can(), so they always pass here.
    return can ? can(item.requiredPermission) : false
  })
}
