import type { UserRole } from '@/types'

export interface NavItem {
  label: string
  path: string
  icon: string
  roles: UserRole[] | 'all'
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard', roles: 'all' },
  { label: 'Projets', path: '/projects', icon: 'Building2', roles: 'all' },
  { label: 'Pipeline', path: '/pipeline', icon: 'GitBranch', roles: 'all' },
  { label: 'Taches', path: '/tasks', icon: 'CheckSquare', roles: 'all' },
  { label: 'Planning', path: '/planning', icon: 'Calendar', roles: 'all' },
  { label: 'Dossiers', path: '/dossiers', icon: 'FolderOpen', roles: 'all' },
  { label: 'Objectifs', path: '/goals', icon: 'Target', roles: 'all' },
  { label: 'Performance', path: '/performance', icon: 'TrendingUp', roles: 'all' },
  { label: 'Agents', path: '/agents', icon: 'Users', roles: ['admin', 'super_admin'] },
  { label: 'Pages capture', path: '/landing', icon: 'Globe', roles: ['admin', 'super_admin'] },
  { label: 'Rapports', path: '/reports', icon: 'BarChart3', roles: 'all' },
  { label: 'Paramètres', path: '/settings', icon: 'Settings', roles: ['admin', 'super_admin'] },
]

export function getVisibleNavItems(role: UserRole | null): NavItem[] {
  if (!role) return []
  return NAV_ITEMS.filter(
    (item) => item.roles === 'all' || item.roles.includes(role),
  )
}
