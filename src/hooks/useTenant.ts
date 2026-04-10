import { useAuthStore } from '@/store/authStore'
import { useSuperAdminStore } from '@/store/superAdminStore'

export function useTenant() {
  const tenantId = useAuthStore((s) => s.tenantId)
  const role = useAuthStore((s) => s.role)
  const inspectedTenantId = useSuperAdminStore((s) => s.inspectedTenantId)

  // Super Admin uses inspected tenant, or null if not inspecting
  if (role === 'super_admin') {
    if (inspectedTenantId) return inspectedTenantId
    throw new Error('Super Admin must select a tenant to inspect')
  }

  if (!tenantId) {
    throw new Error('useTenant must be used within an authenticated context')
  }

  return tenantId
}

/** Safe version that returns null instead of throwing */
export function useTenantSafe(): string | null {
  const tenantId = useAuthStore((s) => s.tenantId)
  const role = useAuthStore((s) => s.role)
  const inspectedTenantId = useSuperAdminStore((s) => s.inspectedTenantId)

  if (role === 'super_admin') return inspectedTenantId
  return tenantId
}
