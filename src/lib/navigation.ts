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
  { label: 'Planning', path: '/planning', icon: 'Calendar', roles: 'all', requiredPermission: 'visits.view_own' },
  { label: 'Dossiers', path: '/dossiers', icon: 'FolderOpen', roles: 'all', requiredPermission: 'dossiers.view' },
  { label: 'Objectifs', path: '/goals', icon: 'Target', roles: 'all', requiredPermission: 'goals.view_own' },
  { label: 'Performance', path: '/performance', icon: 'TrendingUp', roles: 'all', requiredPermission: 'performance.view_own' },
  { label: 'Agents', path: '/agents', icon: 'Users', roles: ['admin', 'super_admin'], requiredPermission: 'agents.view' },
  { label: 'Pages capture', path: '/landing', icon: 'Globe', roles: ['admin', 'super_admin'], requiredPermission: 'landing.view' },
  { label: 'Rapports', path: '/reports', icon: 'BarChart3', roles: 'all', requiredPermission: 'reports.view' },
  { label: 'ROI Marketing', path: '/marketing-roi', icon: 'Target', roles: ['admin', 'super_admin'] },
  { label: 'Integrations', path: '/integrations', icon: 'Key', roles: ['admin', 'super_admin'] },
  { label: 'Facturation', path: '/billing', icon: 'CreditCard', roles: ['admin', 'super_admin'] },
  { label: 'Nouveautes', path: '/changelog', icon: 'Sparkles', roles: 'all' },
  { label: 'Paramètres', path: '/settings', icon: 'Settings', roles: ['admin', 'super_admin'], requiredPermission: 'settings.view' },
]

export function getVisibleNavItems(
  role: UserRole | null,
  can?: (permission: PermissionKey) => boolean,
): NavItem[] {
  if (!role) return []
  // Admin/super_admin see everything
  if (role === 'admin' || role === 'super_admin') {
    return NAV_ITEMS
  }
  // Agent: filter by permission profile
  return NAV_ITEMS.filter((item) => {
    if (!item.requiredPermission) return true
    return can ? can(item.requiredPermission) : item.roles === 'all'
  })
}
