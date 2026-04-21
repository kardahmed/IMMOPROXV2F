import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import type { UserRole } from '@/types'

interface RoleRouteProps {
  allowedRoles: UserRole[]
}

export function RoleRoute({ allowedRoles }: RoleRouteProps) {
  const role = useAuthStore((s) => s.role)

  if (!role || !allowedRoles.includes(role)) {
    return <ForbiddenPage />
  }

  return <Outlet />
}
