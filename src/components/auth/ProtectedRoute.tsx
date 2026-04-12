import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useSuperAdminStore } from '@/store/superAdminStore'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, role } = useAuth()
  const { inspectedTenantId } = useSuperAdminStore()

  // Wait until session check AND profile fetch are complete
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-immo-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo-180.png" alt="IMMO PRO-X" className="h-12 w-12 animate-pulse" />
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" />
          <p className="text-xs text-immo-text-muted">Connexion en cours...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Profile loaded but role is null (fetch failed) → login
  if (role === null) {
    console.warn('[ProtectedRoute] Role is null after loading, redirecting to login')
    return <Navigate to="/login" replace />
  }

  // Super admin without inspection mode → redirect to /admin
  if (role === 'super_admin' && !inspectedTenantId) {
    return <Navigate to="/admin" replace />
  }

  return <Outlet />
}
