import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useSuperAdminStore } from '@/store/superAdminStore'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, role } = useAuth()
  const { inspectedTenantId } = useSuperAdminStore()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-immo-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-immo-accent-green border-t-transparent" />
          <p className="text-sm text-immo-text-muted">Chargement...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Super admin without inspection mode → redirect to /admin
  if (role === 'super_admin' && !inspectedTenantId) {
    return <Navigate to="/admin" replace />
  }

  return <Outlet />
}

